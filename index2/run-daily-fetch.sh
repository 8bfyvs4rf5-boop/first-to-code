#!/bin/bash
# 매일 launchd가 실행하는 스크립트 — 경제정책 + 주요 정책 데이터를 순서대로 갱신한다.
cd "$(dirname "$0")" || exit 1
/usr/local/bin/node fetch-economy-news.js
/usr/local/bin/node fetch-policy-news.js
