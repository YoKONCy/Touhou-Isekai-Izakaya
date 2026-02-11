package main

import (
	"fmt"
	"log"

	"github.com/gorilla/websocket"
)

const MaxPlayers = 6

type Room struct {
	id           string
	name         string // 房间显示名称
	passwordHash string
	hub          *Hub

	// Registered clients.
	clients map[*Client]bool

	// Inbound messages from the clients.
	broadcast chan []byte

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
		broadcast:    make(chan []byte),
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

		case message := <-r.broadcast:
			// Fan-out to all clients
			for client := range r.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(r.clients, client)
				}
			}
		}
	}
}
