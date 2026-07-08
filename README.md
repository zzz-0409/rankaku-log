# 乱獲ログ

サーモンランの乱獲リザルトを記録するWebアプリです。

## 保存方式

この版はRenderのNode.jsサーバーで動かし、アカウントと記録をサーバー側に保存します。

- アカウント名とパスワードでログインします。
- 記録はアカウントごとに分かれます。
- パスワードはサーバー側でハッシュ化して保存します。
- 記録データはRenderの永続ディスク上のJSONファイルに保存します。

## ローカル起動

```bash
npm install
npm start
```

起動後に `http://localhost:3000` を開きます。

## Renderで公開

RenderではStatic Siteではなく、Web Serviceとして作成します。

1. Renderで `New` -> `Web Service` を選びます。
2. GitHubの `rankaku-log` リポジトリを選びます。
3. Runtimeは `Node` を選びます。
4. Build Commandは `npm install` にします。
5. Start Commandは `npm start` にします。
6. Environment Variablesに `SESSION_SECRET` を追加します。
   - 値は長いランダム文字列にしてください。
7. Diskを追加します。
   - Mount Path: `/var/data`
   - Size: 1GB
8. Environment Variablesに `DATA_DIR=/var/data` を追加します。
9. Deployします。

`render.yaml` からBlueprintとして作成する場合は、上記の設定がファイルに入っています。

## 注意

Renderのディスクなしで動かすと、再起動や再デプロイでサーバー上の保存ファイルが消える可能性があります。サーバー保存で運用する場合は、永続ディスクかデータベースを必ず使ってください。

GitHub Pages版は静的サイトなので、サーバー保存には使いません。サーバー保存で使う本番URLはRenderの `https://...onrender.com` のURLです。
