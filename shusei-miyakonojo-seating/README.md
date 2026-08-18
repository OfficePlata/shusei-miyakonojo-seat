# 座席表メーカー（守成クラブ都城）

例会の卓割を作るツール。<https://shusei-miyakonojo-seat.a-sasahala.workers.dev>

参加者と卓割の**正は Lark BASE**（守成クラブ都城 `F9bgbmD20aazWss3k6kjnrVhpfn`）。
このツールはその編集画面という位置づけで、ブラウザの localStorage は作業中の下書きにすぎない。

## 使う順番

1. ヘッダで例会を選ぶ（Lark の「例会マスタ」から出る）
2. **参加者を取得** … Lark の「出欠記録」から、その例会に**出席の回答がある人だけ**を読み込む。
   自会場・他会場・ゲストの3区分すべて（受付を通るのは3つ全部）
3. 卓を並べて配置する（自動配置でもよい）
4. **卓割を保存** … Lark へ書き戻す。
   ポータルの受付名簿がこの卓番号を読み、受付でこの番号を伝える

保存しない限り Lark は変わらない。逆に、保存すれば受付名簿に即反映される。

## データの流れ

```
本部会員HP ──→ Lark BASE 出欠記録 ──→ 座席表メーカー（このツール）
                     ↑                        │ 卓割を保存
                     └────────────────────────┘
                     │
                     └─→ セワニンジャ・ポータル「例会受付名簿」（卓番号を印刷）
```

出欠の取り込みは `sewaninja-portal/scripts/`（毎日8:00 に launchd で自動同期）。
詳細は `sewaninja-portal/docs/urls.md`。

## 保存先（Lark BASE）

| 何を | どこに |
|---|---|
| 卓の定義・配置・割当（ツールの状態） | 例会マスタ `tblX6OGZ97Bv8Yig` の「座席レイアウト」に JSON |
| 1人ずつの卓名・席番号 | 出欠記録 `tblt95tfb4lGvF8R` の「テーブル番号」「席番号」 |

フィールド名の正は `sewaninja-portal/docs/base-schema.md`。片方だけ直さない。

ツール上で手で足した参加者は Lark に行が無いため卓割を保存できない。
保存時に人数を通知する（当日の飛び込みはポータルの受付名簿2枚目に記入欄がある）。

## 認証

**付けていない。** URL を知っていれば誰でも開け、API を叩けば会員の氏名・会社名・
ゲストの紹介者が取得でき、卓割も書き換えられる。承知のうえの構成（2026-08-18 時点）。
認証を足すときは `worker/index.ts` の `fetch` の先頭でセッションを見れば済むようにしてある。

## 開発

```bash
npm run build                 # Next の静的エクスポート（out/）
npx wrangler dev --port 8790  # API と静的配信を同時に立てる
```

`.dev.vars` に `LARK_APP_SECRET` が要る（コミットしない）。
本番へは `npx wrangler secret put LARK_APP_SECRET`。

## デプロイ

```bash
npx wrangler whoami   # account が d945eddc…（OFFICE PLATA 自社）か目視
npm run build
npx wrangler deploy
```

`wrangler.toml` の `account_id` はピン留め済み。誤アカウントへ出さないこと。

## 構成

| パス | 役割 |
|---|---|
| `src/` | 画面（Next.js / static export） |
| `src/lib/store.ts` | 状態（zustand + localStorage）。Lark 連携もここ |
| `src/lib/lark.ts` | API クライアント |
| `worker/` | API 本体（Lark BASE の読み書き）。Next のビルド対象外 |
