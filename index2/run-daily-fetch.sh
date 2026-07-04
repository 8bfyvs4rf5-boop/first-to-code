#!/bin/bash
# 매일 launchd가 실행하는 스크립트 — 경제정책 + 주요 정책 + 주요외신동향 데이터를 순서대로 갱신한다.
cd "$(dirname "$0")" || exit 1

# launchd가 새벽에 맥을 깨울 때 와이파이가 아직 안 붙어있는 경우가 있어
# 최대 5분간 10초 간격으로 네트워크 연결을 확인한 뒤 진행한다.
# (그래도 안 붙으면 그냥 진행 — fetch-*.js가 개별 소스 실패를 이미 허용한다.)
NETWORK_MAX_WAIT=300
NETWORK_CHECK_INTERVAL=10
waited=0
until curl -s -o /dev/null --max-time 5 https://www.google.com; do
  if [ "$waited" -ge "$NETWORK_MAX_WAIT" ]; then
    echo "[경고] ${NETWORK_MAX_WAIT}초 동안 네트워크 연결을 확인하지 못해 그대로 진행합니다." >&2
    break
  fi
  sleep "$NETWORK_CHECK_INTERVAL"
  waited=$((waited + NETWORK_CHECK_INTERVAL))
done

/usr/local/bin/node fetch-economy-news.js
/usr/local/bin/node fetch-policy-news.js
/usr/local/bin/node fetch-foreign-news.js
