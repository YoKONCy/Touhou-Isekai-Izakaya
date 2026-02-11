package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"sync"
	"time"
)

// RateLimiter 简单的令牌桶限流器实现
type RateLimiter struct {
	ips sync.Map
}

type clientLimiter struct {
	tokens     float64
	lastUpdate time.Time
}

func (rl *RateLimiter) Limit(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr
		// 针对联机请求，每秒允许 5 个新连接，桶容量为 10
		rate := 5.0
		capacity := 10.0

		v, _ := rl.ips.LoadOrStore(ip, &clientLimiter{
			tokens:     capacity,
			lastUpdate: time.Now(),
		})
		limiter := v.(*clientLimiter)

		now := time.Now()
		dt := now.Sub(limiter.lastUpdate).Seconds()
		limiter.tokens += dt * rate
		if limiter.tokens > capacity {
			limiter.tokens = capacity
		}
		limiter.lastUpdate = now

		if limiter.tokens < 1.0 {
			http.Error(w, "Rate limit exceeded", http.StatusTooManyRequests)
			return
		}

		limiter.tokens -= 1.0
		next(w, r)
	}
}

var limiter = &RateLimiter{}

var addr = flag.String("addr", ":8080", "http service address")

func serveWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	roomId := query.Get("room")
	action := query.Get("action") // "create" or "join"
	isHost := query.Get("host") == "true"
	password := query.Get("pass")
	playerId := query.Get("id")

	playerName := query.Get("name")

	if roomId == "" {
		http.Error(w, "Missing room ID", http.StatusBadRequest)
		return
	}

	var room *Room

	switch action {
	case "create":
		if !isHost {
			http.Error(w, "Only host can create room", http.StatusBadRequest)
			return
		}
		room = hub.createRoom(roomId, password)
		if room == nil {
			http.Error(w, "Room already exists", http.StatusConflict)
			return
		}
	case "join":
		room = hub.getRoom(roomId)
		if room == nil {
			http.Error(w, "Room not found", http.StatusNotFound)
			return
		}
		// Password check
		if room.passwordHash != "" && room.passwordHash != password {
			http.Error(w, "Invalid password", http.StatusUnauthorized)
			return
		}
	default:
		http.Error(w, "Invalid action", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("升级协议错误:", err)
		return
	}

	client := &Client{
		room:   room,
		conn:   conn,
		send:   make(chan []byte, 256),
		isHost: isHost,
		id:     playerId,
		name:   playerName,
	}
	client.room.register <- client

	// Allow collection of memory referenced by the caller by doing all work in
	// new goroutines.
	go client.writePump()
	go client.readPump()
}

func main() {
	flag.Parse()
	hub := newHub()

	http.HandleFunc("/ws", limiter.Limit(func(w http.ResponseWriter, r *http.Request) {
		serveWs(hub, w, r)
	}))

	// 获取房间列表接口
	http.HandleFunc("/rooms", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// 允许跨域
		w.Header().Set("Access-Control-Allow-Origin", "*")
		rooms := hub.listRooms()
		json.NewEncoder(w).Encode(rooms)
	})

	// Simple health check
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("OK"))
	})

	log.Printf("中继服务器启动于 %s", *addr)
	err := http.ListenAndServe(*addr, nil)
	if err != nil {
		log.Fatal("监听服务错误: ", err)
	}
}
