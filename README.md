# 宿ぽっぽや アルバイト管理システム

宿ぽっぽや向けの、スタッフのシフト・稼働・時給/支払い管理アプリです。
[sns-schedule](https://github.com/ishiyama1989/sns-schedule) をベースに作成しています。

## 起動方法

```bash
cd poppoya-staff
npm install      # 初回のみ
npm run dev      # http://localhost:5173 （または表示されたURL）
```

## 技術構成

Vite + React + TypeScript + Supabase（認証・DB・プッシュ通知）

## 現在の制約

sns-scheduleからのコピー直後のため、SNS運用代行チーム向けの文言・機能がまだ残っています。
今後、宿泊施設のシフト・出退勤管理向けに調整していきます。
