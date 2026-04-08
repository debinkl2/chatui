.PHONY: up down logs restart clean

up:
	@test -f .env || cp .env.example .env
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

restart:
	docker compose restart

clean:
	docker compose down -v --remove-orphans
