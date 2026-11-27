# 設計メモ

void-kit を作る側のメモ。決めたことの理由と、まだ決めていないこと。アプリを書く人向けの決まりは各プリセットの docs（[handlers](presets/handlers/docs/handlers.md)・[domains](presets/domains/docs/domains.md)）にあり、ここには書かない。

## 何か

Void を上手に使うためのもの。Void はページ・route・テーブルの置き場所、検証、フォーム、auth、DB を持っている。void-kit が足すのは、Void だけでは書く人任せになっている所（誰が呼べるか、ブラウザに何を送るか、失敗の返し方、業務のルールの置き場所）を決めることだけ。量は hono-kit より少ない。

## 考え方

hono-kit の [DESIGN.ja.md](https://github.com/ashunar0/hono-kit/blob/main/DESIGN.ja.md) の「考え方」を引き継ぐ。

- **揃っていることが一番効く**。AI は毎回ゼロから読む
- **作るものの基準は「それが無いと、どんな間違いが書けてしまうか」**。言えないものは作らない
- **実例が無いものは足さない**。実験で困った実例が出てから足す
- **書いた時点で止めて、直し方を示す**
- **ルールとナレッジを分ける**。別のやり方をすると形が崩れるものだけを持ち、道具の知恵や設計の考え方は外に置く

Void の上に載せるので、これを足す。

- **Void が持っているものは持たない。Void が運ばないものは運ばない**。足すのは、Void の部品を「どこで・どの順で呼ぶか」の決まりだけ
- **Void が変わったら薄くする**。Hono v5 の `defineHandler` に Void が移れば、`createHandler` の中身はその分減る

## 決めたことの理由

- **npm に出さず、プリセットを写して持つ**（shadcn と同じ）。決まりの文面も形もまだ動くので、パッケージにすると版を上げるたびに追いかけることになる。hono-kit が domains を `presets/` に置いたのと同じ理由。仕組みの側（handlers）は、形が落ち着いたらパッケージに入れる
- **プリセットは handlers と domains に分ける**。hono-kit の「仕組みはパッケージ、決めごとはアプリ」に合わせた。handlers は仕組み（どのアプリでも同じ）、domains はアプリが選ぶアーキテクチャ。`Result`・`Failure` は domains の usecase も使うが、仕組みなので handlers に置く
- **`.void/` は名前で読む**（lint）。`@auth-schema` の不具合を避けて `.void/better-auth-schema` をパスで読むと、domains の lint が auth のテーブルだと分からず素通りする（会員の試験で AI が気づいた）
- **自分のテーブルを持たない domain を認める**。会員の一覧のように、読むものが auth のテーブルだけの domain は `queries.ts` だけを持つ。貸出の queries に置くと「queries は domain の都合で決める」とずれる（会員の試験で AI がこう置いた）
- **書く瞬間に確かめることも、書く側の domain に置く**。除籍は「貸出中か確かめる → 書く」、貸出は「除籍済みか確かめる → 書く」の 2 段で、間に相手が入ると「除籍済みなのに貸出中」ができた（同時に 60 回投げて 3 回）。D1 には行ロックも途中で止められるトランザクションも無いので、確かめることを書き込みの条件にして 1 文にするしかない。1 文の条件は自分のテーブルしか読めない（テーブルの持ち主の決まり）ので、条件に要る状態は書く側の domain のものにした。除籍は本の列ではなく、貸出の domain の `retirements`。書誌（本）と流通（貸出）の分け方で、ほかの domain のテーブルを条件に使う例外は足さなかった（どこまで許すかの線が引けない）。本の domain が「貸出を見ずに除籍する」関数を公開する必要も消えた。直したあとは 60 回で 0 回
- **アプリ側では `src/lib/void-kit/` に置く**。アプリ自身の共通の関数（日付の計算など）を置く `src/lib/` と混ざると、どれを触ってよいか分からなくなる（貸出の試験で、AI が日付の計算の置き場所に迷った）

### pages

- **UI は DAA（Dual-Axis Architecture）に従う**。`pages/` は URL と画面を結ぶだけで、画面と部品は `src/components/` の screens・widgets・shared に置く（あさひの決まり。2026-11-27、サークル収支の 3 回目の前に足した）
- **ページは必ず `<ディレクトリ>/index.tsx`**。`members.tsx` や `[id].tsx` を許すと、ページが育ったときに切り出したものの置き場所が無い。画面と部品も同じ理由で 1 つずつディレクトリ
- **DAA のフロントのドメイン（`features/` の transport・queries）は作らない**。Void ではデータは loader の props で届き、書き込みは `useForm` で action に送るので、ブラウザからサーバーを呼ぶ所が無い。ドメインはサーバーの `src/domains/` だけ
- **画面の props の型は loader から取る**（画面が `pages/.../index.server` の `Props` を型だけ import する）。`response` が形を決めるので、1 か所に書くだけで済む
- **lint で止めるのは、ページのファイル名・ページが結ぶだけか・画面どうしの import・shared がドメインを読むこと**。widgets どうしの循環はまだ止めていない

### createHandler

- **loader・action・route をすべて 1 つの関数で作る**。Void は全部に同じ `defineHandler` を使うので、こちらも置き場所で分けない
- **handler は設定のオブジェクトの最後の欄（`handler:`）に入れる**。前は hono-kit の `createEndpoint` と同じ「設定＋ handler」の 2 つの引数だったが、formatter（oxfmt、prettier と同じ決まり）は、書いた人が設定を 1 行で書くと 1 行のまま残し、改行して書くと広げる。同じ中身が 2 通りの形になり、欄が増えると 1 行に詰まった設定が読めない。カリー化（`createHandler({...})(async ...)`）も同じで、書き方しだいで 2 通りに分かれる。設定の中に複数行の関数があると formatter は設定を 1 行にできないので、誰が書いても 1 欄 1 行になり、lint で止めなくて済む（Fastify の `{ schema, handler }`、Nuxt の `defineEventHandler({ handler })` と同じ形）。型は、設定を 1 つの型引数で受けると、handler が隣にあるときに `body` などが推論されなくなったので、`body`・`query`・`params`・`response` に 1 つずつ型引数を持たせた。`response` で戻り値を縛る型も同じように効き、ずれは `handler:` の行に出る
- **設定の欄は `auth`（必須）・`middleware`・`body` / `query` / `params`・`response`**。入力の欄は Void の名前に合わせた（Hono v5 は `param` / `json` など。Void が v5 に移ったら合わせる）。header・cookie は実例が無いので持たない。`middleware` は Void が handler の前に 5 個までしか並べられないので、`auth` を除いて 4 個まで（型で止める）
- **走る順は auth → middleware → 検証 → handler**。Void の handler の中で `requireAuth` を呼ぶと検証より後になり、サインインしていない人の `?status=bogus` が 400 になった（サインインへ飛ぶべき所）。Void は `defineHandler(middleware, defineHandler.withValidator(...)(handler))` の形で、middleware を検証より先に走らせ、型（`useForm`・`InferProps`）も保つ。`createHandler` はこれを組み立てる。Void の内部ではなく、公開されている形の上に作っている
- **auth を必須にする**。Void の `requireAuth` は呼び忘れても止まらない。必須の欄にして、書き忘れと「わざと公開」（`allowAnonymous`）を見分ける（hono-kit と同じ）。いったんは「global middleware で全部閉じる」にしたが、公開のページや役割（管理者だけ）がパスの一覧と handler に散らばるのでやめた
- **門番はページ用の `requireMember`（サインインへ飛ばす）と route 用の `requireMemberApi`（401）の 2 つ**。`fetch` はリダイレクトに付いていき、サインイン画面の HTML を受け取ってしまう。`createHandler` は自分が `pages/` と `routes/` のどちらに置かれたかを知らない。リクエストを見て決めると、画面遷移がページのデータを裏で取りに行く仕組み（Void の中身）に頼ることになる
- **アプリが作る門番（`requireAdmin` など）は `src/guards.ts` に置き、断るときも Failure を `throw toHttp(...)` で投げる**。`src/lib/` は domain を import できず、domain は `void/auth` を import できないので、その間の置き場所が要る（管理者の試験で、AI が置き場所に迷って自分で決めた）。呼んだ人だけで決まる権限（管理者だけ）は門番、行を見ないと決まらない権限（自分の貸出だけ）は usecase。門番にすると、入力の検証より先に断れて、`auth:` を grep すれば入口が全部出る
- **全ページ共通のデータ（ヘッダー）は、各 loader が 1 つの関数から返し、`response` に書く**。Void の shared（middleware の `c.set("shared", ...)`）は `response` を通らずに全ページの HTML に入るので、行をそのまま置くと全部の列が出る。関数は guard が返したものを受け取るので、guard の隣（`src/guards.ts`）に置く（サークル収支の試験で、AI がこの形にしたが docs に置き場所が無かった）
- **domain の前後は、id を持つ側ではなく、読む・呼ぶ向きで決める**。帳簿は口座にサークルの id を持つが、サークルを作るときに帳簿の usecase を呼び、帳簿はサークルを読まない。このときサークルが後（サークル収支の試験で、AI が外部キーの決まりとの食い違いに迷った）
- **void-kit から写したファイルは、アプリの lint と fmt から外す**。Void 1.12 の雛形は `@cloudflare/oxlint-config` を最初から入れていて、写したファイルはそれに合っていない
- **門番が 403 で断るアプリは `pages/_error.tsx` を持つ**。無いと、ページの 403 は素のテキストで返る。action の 403 も `_error.tsx` が受け止める（`throwOnError: false` は要らない）。dev では `_error.tsx` を初めて使うときに読み込みを待つので、一瞬画面が空になる（これを Void の不具合と取り違えた）
- **handler の 2 つ目の引数に、入力・`member`・`now` を入れる**。Void は検証した入力を 2 つ目の引数で渡し、`c.req.valid(...)` には登録しない。Hono v5 も 2 つ目で渡す。`member` を `c.var` に置かないのは、Void の `c.var` の型がアプリ全体で 1 つ（`CloudContextVariables`）で、`auth` によって型を変えられないから。2 つ目の引数なら、`requireMember` で `AuthUser`、`allowAnonymous` で `null` と分けられる。`now` は型の問題は無いが、受け取るものを 1 か所に揃えた
- **`response` は loader と route で必須、action では書かない**。loader の戻り値はそのままページの HTML に埋め込まれ、route の戻り値はそのまま送られる。行をそのまま返すと全部の列が出ていく（会員の行ならメールアドレス）。スキーマに通した値を返すので、宣言に無い項目は落ち、合わなければ 500（型が見逃したバグ）。action は何も返さない（ページを描き直す）かリダイレクトなので要らない。必須かどうかは型では分からない（関数は自分が loader か知らない）ので lint で見る
- **handler の戻り値の型を `response` のスキーマの入力で縛る**。縛らないと、テーブルの列の型が変わって戻り値とスキーマがずれても、実行して 500 になるまで分からない。スキーマを loader の隣に手で書くのは、ドメインの型との二重になるが、書く量は AI が書くので気にしない（hono-kit と同じ）。困るのはずれが見えないことだけ。TypeScript 7 は、コールバックの戻り値のずれを return ではなく関数の頭で報告する（型引数の無い素直な形でも同じ。設定と handler を 2 回に分けて呼んでも変わらない）。return に赤線を出すには hono-kit の `reply.success(...)` のように戻り値を引数で受ける関数が要るが、Void の上では `reply` を捨てて概念を減らしたので戻さない。メッセージの最後の行がずれた項目を名指しするので、docs でそこを読むように書いた
- **時計を読むのは `createHandler` だけ**。Void には時計を差し込む口が無く、どこでも `new Date()` を呼べる。貸出の試験では「今日」が `rules.ts`（I/O を持たないはずの所）に入り込んだ。リクエストごとに 1 回読んで `now` で渡し、usecase には日付を引数で渡す。テストで固定するのは vitest の `vi.setSystemTime` に任せ、hono-kit の `clock` のような差し込み口は作らない（アプリを組み立てるのは Void なので）
- **素の `defineHandler`・`c.json`・時計は lint で止める**。Void はどんな handler でも受け付けるので、`createHandler` を通さずに書けば `auth` も `response` も素通りする。型では止められない
- **`/` から別のページへ送るだけなら `void.config.ts` の `routing.redirects`**。loader で書くと `response` を書くことになる

### 失敗

- **決まった失敗は `Result` で返し、どうしようもないものは throw**（hono-kit と同じ）。どんな失敗がありうるかが型に出て、`ok` で絞り込まないと値が読めない
- **失敗は domain の `rules.ts` に `{ code, kind, message } as const satisfies Failure` で宣言する**。`kind` から HTTP のステータスを決める表は `toHttp` が 1 か所で持つ。アプリのコードに 409 や 422 を書かない
- **入口が `throw toHttp(result.error)` で HTTP に変える**。usecase は HTTP を知らないので、cron からもそのまま呼べる。Void は `HTTPException` の文言を `form.error` に入れるので、画面の側の仕組みは足さない
- **`message` は画面にそのまま出る文言で、失敗は「その操作ができなかったこと」に付ける**。同じ「貸出中」でも、除籍できない（`BOOK_ON_LOAN`）と借りられない（`BOOK_NOT_AVAILABLE`）は別の失敗で、文言も別。hono-kit の「code は `<THING>_` ＋何が起きたか」と同じ考え方。貸出の試験で AI が「使い回せない」と迷ったのは、docs に書いていなかったから

### テスト

- **テストは本物の D1 に当てる**。除籍と貸出の正しさは SQL（条件付きの INSERT、部分ユニークインデックス）に乗っているので、`void/db` を中身の無い偽物にすると肝心な所が試せない。Void の docs のとおり `vi.mock("void/db")` で差し替えるが、差し替える先は Miniflare の D1（`vp dev` と同じもの）にマイグレーションを当て、Void の `createDb` で包んだ本物の `db`。Node の SQLite（`node:sqlite` など）も試せるが、ドライバが D1 と違い `db.batch` が無い。Miniflare を devDependency に足して版を Void に合わせる手間はかかる。テストファイルごとに 0.5 秒ほどで立つ
- **差し替えは `setupFiles` で全部のテストファイルに効かせる**。テストごとに `vi.mock` を書くと長く、書き忘れると本番の `db` を読みに行く
- **同時に書く 2 つは `Promise.all` で試す**。JavaScript は `await` のたびに入れ替わるので、読んでから書くまでの隙間に相手が入る。直す前の除籍と貸出（確かめてから書く 2 段）は、このテストで毎回落ちた（curl で 60 回投げて 3 回しか出なかったもの）
- **loader・action・route はテストしない**。誰が呼べるか・入力・送るものは `createHandler` と型と lint が守る。handler は usecase と queries を呼ぶだけにして、そちらをテストする（前の版から同じ考え）。loader が仕様の決まり（「貸出可」＝除籍されていない かつ 貸出中でない、会員ごとの冊数と延滞の印）で結果を組み合わせると、そこがテストされずに残った（テストの試験で AI が指摘）。その決まりは `rules.ts` の関数にして、loader は呼ぶだけにする。I/O が無いのでそのままテストでき、同じ印を出すページが複数あっても食い違わない
- **`routes/`・`pages/` にテストを置かない**（lint）。Void はそこにあるファイルを全部 route かページにする。Void の docs も同じことを言っている。前の版の `route-file-is-index`（1 つの URL に `index.ts` 1 つ）は、置き場所の揺れを止めるものでもあったが、ページは Void の置き方（`pages/books/[id].tsx`）に従うので、テストの事故だけを止める形にした

## 前の版から捨てたもの

最初の void-kit（2026-11-23 まで）は、routes 用の `createEndpoint` と、失敗の型をクライアントに運ぶ仕組みを持っていた。pages の loader / action で書くと Void の仕組みと二重になるので、0 から考え直した。

- **`reply`（`reply.success` / `reply.failure`）と `Replied` の印**。hono-kit で `reply` を作ったのは、Hono の RPC が return した値からクライアントの型を作り、throw した失敗は型に出ないから。Void のページでは、失敗はそもそもクライアントの型に載らない（`form.error` に届くのは `status` と `message` だけ）。届け先の無い型を運ぶ仕組みは要らない
- **`__failures`・`void-kit prepare`・`fetchResult`**（失敗の code を typed fetch の型に載せる）。同じ理由。route を `fetch` で呼ぶ実例が出たら考え直す
- **自前の入力の検証**。失敗の形を `{ error: { code, message } }` に揃えるためだったが、ページでは Void の検証でないと `form.errors` が効かない
- **`void-kit init`・`void-kit check`・npm 向けのビルド**。プリセットを写して持つ形にしたので要らない

## 未決

- **前の版から持ってくる候補**
  - `guard` に印を付けて、手で書いた `{ check }` を `auth` に置けないようにする
  - Void の auth が無効なとき、直し方を書いて止める（黙って全部 401 にしない）
  - lint `no-module-scope-state`（Workers はリクエストをまたいでモジュールの変数を共有する）
- **route がファイル（CSV・画像）を返す形**。`createHandler` は route に `response` を求めるが、ファイルは JSON のスキーマで書けない。サークル収支の 2 回目で、AI は CSV をブラウザで作って避けた。領収書の写真を返す回で決める
- **presets を `@cloudflare/oxlint-config` に合わせるか**。今はアプリの lint と fmt から外している
- **`UserId` の印と lint `no-id-cast`**。id の取り違えの実例が出たら
