# 乱獲ログ

サーモンランの乱獲リザルトを画像OCRで読み取り、アカウントごとにステージ別の平均と最高記録を集計するWebアプリです。

## 使い方

1. `index.html` を開く
2. アカウント名とパスワードを入力してログインする
3. スクリーンショットを選ぶ
4. 「画像を読み取る」を押す
5. 「昼のみ」または「夜あり」を選ぶ
6. 数字を確認・修正する
7. 「この記録を保存」を押す

## アカウント

このアプリはGitHub Pagesで公開できる静的アプリです。ログインは端末内のローカル保存で、アカウントごとに記録を分けます。
パスワードはハッシュ化して保存します。
サーバー認証や他端末同期はありません。

## 最高まとめ

「最高まとめ」ページでは、昼のみ・夜ありに分けて、各ステージの最高納品数と保存画像を確認できます。
昼のみの合計納品数、夜ありの合計納品数もまとめて表示します。

## GitHub Pagesで公開

1. このフォルダをGitHubリポジトリにpushする
2. GitHubのリポジトリ画面で `Settings` → `Pages` を開く
3. `Build and deployment` の `Source` を `GitHub Actions` にする
4. `main` ブランチへpushすると `.github/workflows/pages.yml` が公開処理を実行する

ローカルで新しいリポジトリとして公開する例:

```bash
git init
git add .
git commit -m "Initial release"
git branch -M main
git remote add origin https://github.com/USER/REPOSITORY.git
git push -u origin main
```

## 注意

OCRは救助・デスの読み取りが苦手なため、保存前に手動で確認してください。
