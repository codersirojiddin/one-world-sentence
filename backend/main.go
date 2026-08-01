package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"one-world-sentence/backend/auth"
	"one-world-sentence/backend/db"
	"one-world-sentence/backend/handlers"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	if err := db.Connect(); err != nil {
		log.Fatalf("postgres connection failed: %v", err)
	}
	defer db.Close()

	if err := db.ConnectRedis(); err != nil {
		log.Fatalf("redis connection failed: %v", err)
	}

	if err := auth.Init(); err != nil {
		log.Fatalf("neon auth (jwks) initialization failed: %v", err)
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RealIP)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "Authorization"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Route("/api", func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"ok"}`))
		})

		r.Get("/stream", handlers.StreamHandler)

		// Public reads: anyone can follow the story without signing in.
		r.Group(func(r chi.Router) {
			r.Use(auth.Optional)
			r.Get("/sentences", handlers.ListSentences)
			r.Get("/sentences/{id}/reveal", handlers.RevealSoftHidden)
			r.Get("/books", handlers.ListBooks)
			r.Get("/books/{id}", handlers.GetBook)
			r.Get("/users/{id}/sentences", handlers.ListUserSentences)
			r.Get("/profiles/check", handlers.CheckUsernameAvailable)
			r.Get("/profiles/{username}", handlers.GetPublicProfile)
		})

		// Writes: require a verified Neon Auth session.
		r.Group(func(r chi.Router) {
			r.Use(auth.Required)

			r.Post("/sentences", handlers.CreateSentence)
			r.Post("/sentences/{id}/flag", handlers.FlagSentence)

			r.Get("/books/mine", handlers.ListMyBooks)
			r.Get("/books/bookmarked", handlers.ListMyBookmarks)
			r.Get("/profiles/me", handlers.GetMyProfile)
			r.Put("/profiles/me", handlers.UpdateMyProfile)
			r.Post("/books", handlers.CreateBook)
			r.Patch("/books/{id}", handlers.UpdateBook)
			r.Post("/books/{id}/bookmark", handlers.ToggleBookmark)
			r.Get("/books/{id}/collaborators", handlers.ListCollaborators)
			r.Post("/books/{id}/collaborators", handlers.InviteCollaborator)
			r.Delete("/books/{id}/collaborators/{collaboratorId}", handlers.RemoveCollaborator)
		})

		// Admin panel: requires the caller's email to be in ADMIN_EMAILS.
		r.Group(func(r chi.Router) {
			r.Use(auth.RequireAdmin)

			r.Get("/admin/stats", handlers.AdminStats)
			r.Get("/admin/books", handlers.AdminListBooks)
			r.Delete("/admin/books/{id}", handlers.AdminDeleteBook)
			r.Get("/admin/sentences", handlers.AdminListSentences)
			r.Patch("/admin/sentences/{id}", handlers.AdminUpdateSentenceStatus)
			r.Get("/admin/users", handlers.AdminListUsers)
			r.Post("/admin/users/{id}/ban", handlers.AdminBanUser)
			r.Delete("/admin/users/{id}/ban", handlers.AdminUnbanUser)
		})
	})

	// Serve the embedded Next.js static export for everything else.
	staticFS := FrontendFS()
	fileServer := http.FileServer(http.FS(staticFS))
	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		fileServer.ServeHTTP(w, req)
	})
	r.Get("/*", func(w http.ResponseWriter, req *http.Request) {
		fileServer.ServeHTTP(w, req)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0, // must stay unbounded — SSE connections are long-lived
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("[server] listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Println("[server] shutting down gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("[server] shutdown error: %v", err)
	}
}
