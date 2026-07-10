# 乱獲ログ

サーモンランの乱獲リザルトを記録するWebアプリです。

## 無料構成

無料でサーバー保存したい場合は、次の構成で使います。

- GitHub: コード置き場
- Render Free Web Service: アプリとAPIを公開
- Supabase Free: アカウントと記録データを保存

Renderの無料Web Serviceはスリープすることがあります。その場合、最初のアクセスだけ少し待ちます。記録データはSupabase側に保存するので、Renderがスリープしても消えません。

## Supabaseの準備

1. Supabaseで新しいProjectを作成します。
2. Projectの `SQL Editor` を開きます。
3. `supabase-schema.sql` の中身を貼り付けて実行します。
4. Project Settings -> API を開きます。
5. 次の2つを控えます。
   - Project URL
   - service_role key

`service_role key` は秘密情報です。GitHubに書かず、RenderのEnvironment Variablesだけに入れてください。

## Renderで公開

RenderではStatic Siteではなく、Web Serviceとして作成します。

1. Renderで `New` -> `Blueprint` を選びます。
2. GitHubの `zzz-0409/rankaku-log` を選びます。
3. `render.yaml` を検出したら、そのまま進めます。
4. Environment Variablesに次を入れます。
   - `SUPABASE_URL`: SupabaseのProject URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabaseのservice_role key
5. Deployします。

手動でWeb Serviceを作る場合:

- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `npm start`
- Plan: `Free`

## ローカル起動

ローカルではSupabase設定なしでもJSONファイル保存で動きます。

```bash
npm install
npm start
```

Supabaseにつないでローカル確認したい場合は、環境変数に `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を入れて起動します。

## 注意

GitHub Pages版は静的サイトなので、サーバー保存には使いません。サーバー保存で使う本番URLはRenderの `https://...onrender.com` のURLです。
