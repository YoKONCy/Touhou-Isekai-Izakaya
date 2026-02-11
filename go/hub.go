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

func (h *Hub) createRoom(id, password string) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()
	
	if _, ok := h.rooms[id]; ok {
		// Room already exists
		return nil 
	}
	
	room := newRoom(id, password, h)
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
