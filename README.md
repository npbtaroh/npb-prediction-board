# NPB順位予想ボード

NPB順位予想を参加者同士で楽しむためのWebアプリ。

- レギュラーシーズン順位予想：90点
- CS開始前の日本シリーズ進出チーム予想：最大10点
- 合計100点満点

---

# 運用メモ

## シーズン開始前

### 1. 順位予想を実施

参加者でセ・リーグ、パ・リーグの順位予想を行う。

> CS予想はこの時点では行わない。  
> CS進出チームが出揃ってから、日本シリーズ進出チームを改めて予想する。

### 2. 新規ユーザーを追加

参加者が増える場合は `data/users.json` にユーザーを追加する。

### 3. 順位予想を登録

`data/predictions.json` に新年度の順位予想を追加する。

登録内容：

- セ・リーグ順位予想
- パ・リーグ順位予想

この時点では `nipponSeries` はまだ登録しない。

### 4. 新年度を有効化

`data/seasons.json` に新年度を追加する。

例：

```json
"2027": {
  "status": "active",
  "participants": ["nakamura", "futo", "b"],
  "order": ["nakamura", "futo", "b"]
}
```

**`active` にする年度は必ず1つだけにする。**

過去年度は `final` のままにする。

### 5. GitHubへ反映

```powershell
git add .
git commit -m "Add 2027 season"
git push
```

### 6. 自動更新の初回確認

GitHub Actionsの初回実行後、以下を確認する。

- セ・リーグ6球団が取得できている
- パ・リーグ6球団が取得できている
- 順位が正しい
- ゲーム差が正しい
- `data/results.json` の新年度だけが更新されている

---

## シーズン中

`status: "active"` の年度について、GitHub ActionsがNPB公式サイトから順位・ゲーム差を自動取得する。

基本的に手動作業は不要。

### 注意事項

`tools/updateResults.js` では、NPB公式順位表のゲーム差を以下の列番号で取得している。

```js
const GB_COL_INDEX = 6;
```

NPB公式サイトのHTMLや順位表の列構成が変更された場合は、この値の見直しが必要。

また、NPB公式サイトのURL構造が変更された場合は、`tools/updateResults.js` の取得URLも確認する。

---

## レギュラーシーズン終了・CS進出チーム確定後

### 1. 日本シリーズ進出チームを予想

CS進出チームが出揃ってから、参加者全員で日本シリーズ進出チームを予想する。

配点：

- セ・リーグ的中：+5点
- パ・リーグ的中：+5点
- 最大：+10点

**順位予想90点 + CS予想10点 = 100点満点**

### 2. CS予想を登録

`data/predictions.json` の対象年度に `nipponSeries` を追加する。

例：

```json
"nipponSeries": {
  "central": {
    "nakamura": "tigers",
    "futo": "baystars"
  },
  "pacific": {
    "nakamura": "hawks",
    "futo": "fighters"
  }
}
```

### 3. シーズン最終順位確認後、更新停止

最終順位とゲーム差が正しく取得されていることを確認する。

確認後、`data/seasons.json` の対象年度を

```json
"status": "active"
```

から

```json
"status": "final"
```

へ変更する。

例：

```json
"2027": {
  "status": "final",
  "participants": ["nakamura", "futo", "b"],
  "order": ["nakamura", "futo", "b"]
}
```

`final` にした年度は、その後GitHub Actionsの順位更新対象にならない。

### 4. GitHubへ反映

```powershell
git add .
git commit -m "Finalize 2027 season and add 2027 CS predictions"
git push
```

---

## 日本シリーズ進出チーム確定後

`data/results.json` の対象年度に、実際の日本シリーズ進出チームを登録する。

例：

```json
"nipponSeries": {
  "central": "baystars",
  "pacific": "hawks"
}
```

これにより、的中した予想にセ・パ各+5点が加算される。

---

## シーズンオフ

基本的に何もしなくてOK。

全年度が `final` の場合、GitHub Actionsが実行されても更新対象年度なしとして終了する。

**過去年度の結果を見ながらニヤニヤする。**

---

# TODO

- `predictions.json` に `nipponSeries` が追加されたらCS予想欄を自動表示する
- 新年度開始時にNPB公式サイトのHTML構造・ゲーム差列を確認する
