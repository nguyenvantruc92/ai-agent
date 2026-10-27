#!/usr/bin/env bash
# One-command local setup for a fresh clone: creates .env (asks for the secrets,
# never writes them anywhere else), builds and starts the stack, then waits until
# chat answers. Safe to re-run: an existing .env and database are kept.
#
# Non-interactive: OPENAI_API_KEY=sk-... ADMIN_PASSWORD=... ./scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

command -v docker >/dev/null || { echo "Cần cài Docker trước."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Cần Docker Compose v2 (lệnh 'docker compose')."; exit 1; }

# Replaces the KEY= line in .env.
set_env() {
  local tmp
  tmp=$(mktemp)
  awk -v key="$1" -v value="$2" 'index($0, key "=") == 1 { print key "=" value; next } { print }' .env > "$tmp"
  mv "$tmp" .env
}

random_secret() {
  if command -v openssl >/dev/null; then openssl rand -hex 32
  else head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}

echo "==> Build image (lần đầu mất vài phút)"
docker compose build

if [ ! -f .env ]; then
  echo "==> Tạo .env từ .env.example"
  cp .env.example .env

  key="${OPENAI_API_KEY-}"
  if [ -z "$key" ]; then
    read -rsp "OPENAI_API_KEY (Enter để bỏ qua, chat sẽ không trả lời được): " key
    echo
  fi
  [ -n "$key" ] && set_env OPENAI_API_KEY "$key"

  password="${ADMIN_PASSWORD-}"
  while [ -z "$password" ]; do
    read -rsp "Đặt mật khẩu admin (dùng để đăng nhập /admin/login): " password
    echo
  done
  hash=$(docker compose run --rm --no-deps -T web pnpm -s admin:password "$password" | tail -n 1)
  set_env ADMIN_PASSWORD_HASH "$hash"
  set_env ADMIN_SESSION_SECRET "$(random_secret)"
  chmod 600 .env
else
  echo "==> Giữ nguyên .env đang có"
fi

grep -q '^OPENAI_API_KEY=.\+' .env || echo "!! OPENAI_API_KEY đang trống: admin/approval vẫn chạy, nhưng chat và eval sẽ lỗi."

echo "==> Khởi động db, mcp, web, worker (migration + seed đơn demo + import Knowledge tự chạy)"
docker compose up -d

echo -n "==> Chờ web sẵn sàng"
for _ in $(seq 1 60); do
  if docker compose exec -T web node -e "fetch('http://localhost:3000/chat').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))" 2>/dev/null; then
    echo " xong"
    break
  fi
  echo -n "."
  sleep 2
done

echo "==> Dữ liệu trong database"
docker compose exec -T db psql -U fashion -d fashion -c "
  SELECT d.original_filename AS knowledge, d.status, v.version,
         (SELECT count(*) FROM knowledge_chunks c WHERE c.document_version_id = d.active_version_id) AS chunks
  FROM knowledge_documents d LEFT JOIN knowledge_document_versions v ON v.id = d.active_version_id
  WHERE d.deleted_at IS NULL" -c "SELECT count(*) AS demo_orders FROM orders"

cat <<'EOF'

Sẵn sàng:
  Chat : http://localhost:3000/chat
  Admin: http://localhost:3000/admin/login   (mật khẩu vừa đặt)
  Kịch bản test: docs/demo-script.md
  Đặt lại đơn demo về hôm nay: docker compose exec web pnpm db:reset-orders
EOF
