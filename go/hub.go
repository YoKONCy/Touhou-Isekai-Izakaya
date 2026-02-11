package main

import (
	"log"
	"sync"
)

type Hub struct {
	rooms map[string]*Room
	mu    sync.RWMutex
}

func newHub() *Hub {
	return &Hub{
		rooms: make(map[string]*Room),
	}
}

func (h *Hub) getRoom(id string) *Room {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.rooms[id]
}

func (h *Hub) createRoom(id, name, password string) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.rooms[id]; ok {
		// Room already exists
		return nil
	}

	room := newRoom(id, name, password, h)
	h.rooms[id] = room
	go room.run()
	log.Printf("[中心] 房间已创建: %s", id)
	return room
}

func (h *Hub) removeRoom(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.rooms[id]; ok {
		delete(h.rooms, id)
		log.Printf("[中心] 房间已移除: %s", id)
	}
}

type RoomInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	HasPassword bool   `json:"hasPassword"`
	PlayerCount int    `json:"playerCount"`
	MaxPlayers  int    `json:"maxPlayers"`
}

func (h *Hub) listRooms() []RoomInfo {
	h.mu.RLock()
	defer h.mu.RUnlock()

	rooms := make([]RoomInfo, 0, len(h.rooms))
	for id, room := range h.rooms {
		rooms = append(rooms, RoomInfo{
			ID:          id,
			Name:        room.name,
			HasPassword: room.passwordHash != "",
			PlayerCount: len(room.clients),
			MaxPlayers:  MaxPlayers,
		})
	}
	return rooms
}
