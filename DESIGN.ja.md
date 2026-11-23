# 設計メモ

void-kit を作る側のメモ。決めたことの理由と、まだ決めていないこと。

## 何か

hono-kit の決まり（誰が呼べるか・返し方・失敗の番号）を、Void の server routes の上に載せたもの。hono-kit は Void のルーティングの形を借りてビルド・デプロイ・インフラを抜いたものなので、void-kit はその逆向きで、Void が持っているものは持たない。

| | hono-kit | void-kit |
|---|---|---|
| ルーティング・登録・AppType | 自前の生成器（`hnk prepare`） | Void（`void prepare`） |
| 依存（db など） | `createApp({ makeDeps })` | Void の import（`void/db`） |
| セッション | deps の `sessionUser(headers)` | Void の auth（`c.var.user`） |
| 入力の欄 | `param` / `query` / `json` | Void に合わせて `params` / `query` / `body` |
| クライアントの型 | hc（失敗の code まで型に出る） | Void の typed fetch ＋ `fetchResult`（失敗の code まで型に出る） |

## 決めたことの理由

- **Void の `defineHandler` を包む**。`createEndpoint` は Void の `TypedHandler` を返し、`__validators` と `__output` を型に載せる。Void の codegen はそれを読むので、typed fetch は何もしなくても効く
- **`withValidator` は使わない**。Void の検証エラーは `{ error: "Validation failed", issues }` で、失敗の形が 2 つになる。自前で検証して、すべての失敗を `{ error: { code, message, details? } }` にそろえる
- **順番は guard → 入力の検証 → handler**。401 / 403 は ID によらないので、何も漏らさない（hono-kit と同じ）
- **guard は `createGuard` でしか作れない**。hono-kit は Hono の middleware に型で「`currentUser` を置くこと」を求めていた。void-kit は middleware を経由する理由がないので、「呼んだ人を返す関数」にした。印（brand）があるので、手で書いた object も、誰も弾かずに何も置かない middleware も `auth` に書けない
- **Void の auth が無効なら、`getCurrentUser` は直し方を書いて throw する**。Void はサインアウト中の `c.var.user` を `null` に、auth が無効なときは何も置かない（`undefined`）。黙って `null` 扱いにすると、設定を忘れたアプリは全部の `requireAuth` が 401 になって理由が分からない。`allowAnonymous` は user を読まないので、公開の endpoint だけのアプリは auth なしで動く
- **雛形は持たず、`void-kit init` で足す**。アプリの土台（UI フレームワーク・DB・ツール）は `void init` が作る。void-kit が書くのは `.oxlintrc.json`・`AGENTS.md` の印つきブロック（Void と同じ `<!--injected-by-...-->` の形。2 回打っても同じ）・`check` の script だけで、アプリのコードには触らない。Void の雛形の `routes/api/hello.ts` は、`check` の lint が直し方つきで止める
- **`check` はパッケージが持つ**（`void-kit check`）。中身（void prepare → 型検査 → lint → テスト、落ちても最後まで回して失敗をまとめる）はどのアプリでも同じなので、hono-kit のように `scripts/check.mjs` をアプリに写さない。oxlint は void-kit の依存にして、アプリで入れなくて済むようにした。テストの道具はアプリが選ぶので、`test` の script があれば回すだけ
- **npm には dist（`.js` + `.d.ts`）で出す**。`src/*.ts` をそのまま配ると、node_modules の `.ts` には `skipLibCheck` が効かないので、どのアプリも `allowImportingTsExtensions` を足すまで型検査が落ちた（請求書アプリの試験で分かった）。workspace の中では `src` を、npm では `publishConfig` で `dist` を指す。tsc は `.d.ts` の import を `.ts` のまま残すので、`scripts/build.mjs` で `.js` に直す
- **Void の auth があっても `auth` 欄は残す**。Void はアプリのソースの import（`void/auth`）や `void.config.ts` の `auth` から auth を使うと判断し、全部のリクエストにセッションを読む middleware を差し込む。ただしそれは受付（`c.var.user` を置くだけで誰も弾かない）で、`auth` 欄は門番（通すか決める）。欄を消すと、書き忘れと「わざと公開」が区別できず、`currentUser` の型も付かない。名前が Void の auth と重なって紛らわしいので、docs で書き分ける（`access` などへの改名は、困った実例が続いたら考える）
- **`init` は Void の auth を有効にしない**（知らせるだけ）。Void は `node_modules` を読まないので、void-kit の import では有効にならない。`void.config.ts` は Void が生成して人が育てるファイルなので、void-kit は触らない。公開の endpoint だけのアプリもある
- **guard は返しうる失敗を宣言する**（`createGuard([Unauthorized], check)`）。クライアントの型に載せるため。宣言していない失敗を投げたら 500 にして、型と実際がずれないようにした（はじめは読む場所が無いので宣言させていなかった）
- **失敗の型は `__failures` で運び、`void-kit prepare` が表にする**。Void の typed fetch は生成した `RouteMap` から成功の型だけを引き、失敗を足す口が無い。`__output` と同じく型だけの印を endpoint に付け、`routes/` を読んで「パス × メソッド → 失敗」の表（`src/void-kit.gen.d.ts`、`FailureMap` を拡張する）を書く。鍵は Void の `RouteMap` と同じ（`/invoices/[id]`）。書き先が `.void/` でないのは、Void が知らないファイルを消すから。lint で入口が `index.ts` と `export const GET = createEndpoint(...)` に決まっているので、読み取りは正規表現で足りる
- **クライアントは `fetchResult`**（`void-kit/client`）。Void の `fetch` を包み、引数は同じ。宣言した形の失敗（`{ error: { code, message } }`）だけを `err` にして、それ以外は throw のまま。`FetchError` は `instanceof` で見ない（Vite が依存をまとめるとクラスが二重になりうる）
- **handler は `reply` が作ったものしか返せない**（`Replied` の印）。`c.json(...)` で番号や形を勝手に決めると型で止まる
- **1 つの URL に `index.ts` 1 つ**（hono-kit と同じ）。Void は `routes/invoices/[id].ts` も `routes/invoices/[id]/index.ts` も同じ URL にするので、置き場所を選ぶ場面ができる。ディレクトリが URL、と決めれば、`_response.ts` や verb のディレクトリ（`[id]/send/`）も同じ形で並ぶ。Void は `_` で始まらない .ts をすべてルートにするので、横に置いたテストが URL になる事故もこの規則で止まる（lint `route-file-is-index`）
- **lint は型で止まらないものだけ**。Void は HTTP メソッドの名前の export なら何でも endpoint にするので、export の形を決めないと型の決まりが効かない（`route-exports-endpoints`）。hono-kit の `route-responds-200`・`route-replies-through-reply` は `Replied` の型で止まるので持ってこない。`no-clock-outside-app-entry`・`no-new-hono` は、void-kit に `now` も `createApp` も無いので持ってこない
- **テストは Void のやり方に乗る**。Void のテストは Node で動き（Worker も手元の DB も無い）、バインディングは `vi.mock()` で差し替える、と Void の docs が決めている。hono-kit の「本物の DB に HTTP で当てる」は、アプリと DB を自分で組み立てる hono-kit だから素直に書けた。Void で同じことをすると、void-kit が Hono への載せ替え・DB の差し替え・サインインの道具を抱えることになり、「Void が持っているものは持たない」に反する。テストするのは `src/` のロジックで、endpoint の `auth`・入力・失敗は型と lint で守る。void-kit は docs（rules.md）に書くだけで、道具は足さない

## 未決

- **失敗の型を Void に提案する**。今は void-kit が `FailureMap` を別に生成している。Void の `RouteMap` が `__failures` も読めば、生成も `fetchResult` も要らなくなる
- **dev 中の生成**。`void-kit prepare` は `check` と `postinstall` でしか回らないので、dev 中に失敗を足すとエディタの型は `check` まで古い。困ったら Vite の plugin にする
- pages の loader / action に同じ決まりを当てるか
