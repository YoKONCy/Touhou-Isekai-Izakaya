package main

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/gorilla/websocket"
)

const MaxPlayers = 6

type MessageEnvelope struct {
	sender *Client
	data   []byte
}

type Room struct {
	id           string
	name         string // 房间显示名称
	passwordHash string
	hub          *Hub

	// Registered clients.
	clients map[*Client]bool

	// Inbound messages from the clients.
	broadcast chan MessageEnvelope

	// Register requests from the clients.
	register chan *Client

	// Unregister requests from clients.
	unregister chan *Client

	host *Client
}

func newRoom(id, name, password string, hub *Hub) *Room {
	return &Room{
		id:           id,
		name:         name,
		passwordHash: password,
		hub:          hub,
		broadcast:    make(chan MessageEnvelope),
		register:     make(chan *Client),
		unregister:   make(chan *Client),
		clients:      make(map[*Client]bool),
	}
}

func (r *Room) run() {
	defer func() {
		// Cleanup when room stops
		r.hub.removeRoom(r.id)
		// Close all client channels
		for client := range r.clients {
			// Avoid closing closed channels if logic overlaps, but here we just iterate once
			// Actually, client.send is closed here. writePump will detect and close conn.
			select {
			case <-client.send:
				// Already closed?
			default:
				close(client.send)
			}
			delete(r.clients, client)
		}
		log.Printf("[房间 %s] 房间已销毁", r.id)
	}()

	for {
		select {
		case client := <-r.register:
			if len(r.clients) >= MaxPlayers {
				log.Printf("[房间 %s] 连接拒绝: 房间已满", r.id)
				client.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "Room is full"))
				client.conn.Close()
				continue
			}

			r.clients[client] = true
			if client.isHost {
				r.host = client
				log.Printf("[房间 %s] 房主加入: %s", r.id, client.id)
			} else {
				log.Printf("[房间 %s] 访客加入: %s", r.id, client.id)
			}

			// Send Room Info to the new client
			roomInfoMsg := []byte(fmt.Sprintf(`{"type":"SYSTEM_EVENT","payload":{"event":"ROOM_INFO","id":"%s","name":"%s"}}`, r.id, r.name))
			client.send <- roomInfoMsg

			// Broadcast join event
			msg := []byte(fmt.Sprintf(`{"type":"SYSTEM_EVENT","payload":{"event":"PLAYER_JOINED","id":"%s","name":"%s","isHost":%t,"count":%d}}`, client.id, client.name, client.isHost, len(r.clients)))
			for c := range r.clients {
				select {
				case c.send <- msg:
				default:
					close(c.send)
					delete(r.clients, c)
				}
			}

		case client := <-r.unregister:
			if _, ok := r.clients[client]; ok {
				delete(r.clients, client)
				close(client.send)

				if client.isHost {
					log.Printf("[房间 %s] 房主离开，关闭房间。", r.id)
					return // Stop the room loop, triggering defer cleanup
				} else {
					log.Printf("[房间 %s] 访客离开: %s", r.id, client.id)
					// Broadcast leave event
					msg := []byte(fmt.Sprintf(`{"type":"SYSTEM_EVENT","payload":{"event":"PLAYER_LEFT","id":"%s","count":%d}}`, client.id, len(r.clients)))

					for c := range r.clients {
						select {
						case c.send <- msg:
						default:
							close(c.send)
							delete(r.clients, c)
						}
					}
				}
			}

		case envelope := <-r.broadcast:
			// 解析消息，如果是房主发出的踢人指令，服务端直接执行断开操作
			var msg struct {
				Type    string `json:"type"`
				Payload struct {
					TargetId string `json:"targetId"`
				} `json:"payload"`
			}

			if err := json.Unmarshal(envelope.data, &msg); err == nil {
				if msg.Type == "PLAYER_KICKED" && envelope.sender.isHost {
					targetId := msg.Payload.TargetId
					log.Printf("[房间 %s] 房主 %s 请求踢出玩家: %s", r.id, envelope.sender.id, targetId)

					// 寻找目标客户端并关闭连接
					for client := range r.clients {
						if client.id == targetId {
							log.Printf("[房间 %s] 服务端强制断开被踢玩家连接: %s", r.id, targetId)
							// 注意：这里不需要手动从 r.clients 删除，client.readPump 结束会触发 unregister
							client.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "You have been kicked by the host"))
							client.conn.Close()
							break
						}
					}
				}
			}

			// Fan-out to all clients
			for client := range r.clients {
				select {
				case client.send <- envelope.data:
				default:
					close(client.send)
					delete(r.clients, client)
				}
			}
		}
	}
}
