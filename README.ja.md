# void-kit

[Void](https://void.cloud) の server routes（`routes/`）で毎回気をつけることを、型と lint で書いた時点に止める。気をつけることは、誰が呼べるか・何を返すか・失敗の番号・URL とファイルの対応の 4 つ。
止めたときは直し方まで示すので、AI が自分で直せる。失敗の code はクライアントの型にまで届く。

> 非公式。Void（VoidZero）とは関係ない。

[English](README.md)

## なぜ

AI にバックエンドを書かせると、毎回少しずつ揺れる。揺れるのは、URL とファイルの対応・失敗の返し方・権限の確かめ方。
void-kit は形を先に決め、外れたものを止める。

[hono-kit](https://github.com/ashunar0/hono-kit) の Void 版。hono-kit は Void のルーティングの形を借りて、ビルド・デプロイ・インフラを抜いたもの。void-kit はその逆向きで、Void が持っているもの（ルーティング・DB・auth・typed fetch・デプロイ）はそのまま使い、endpoint の書き方の決まりだけを載せる。

```ts
// routes/invoices/[id]/index.ts
export const GET = createEndpoint(
  {
    auth: requireAuth,
    request: { params: z.object({ id: z.string() }) },
    responses: { success: invoiceSchema, failures: [NotFound] },
  },
  async (c, { params }, reply) => {
    const invoice = await findInvoice(c.var.currentUser.id, params.id);
    if (invoice === undefined) return reply.failure(NotFound.code);
    return reply.success(invoice);
  },
);
```

```ts
// クライアント
const result = await fetchResult("/invoices/[id]", { params: { id } });
if (!result.ok) result.error.code; // "NOT_FOUND" | "UNAUTHORIZED" | "VALIDATION_ERROR"
```

## 始め方

まだ npm に出していない。出したら、Void のアプリでこう使う:

```sh
npx void init
npm install void-kit
npx void-kit init
npm run check
```

`void-kit init` は、`.oxlintrc.json`・`AGENTS.md` のブロック・`check` と `postinstall` の script を足す。アプリのコードには触らない。

`void-kit check` は、`void prepare`・失敗の型の生成・型検査・lint・テストを回して、最後に失敗を一覧で出す。AI には「`check` を通して」と言えば足りる。

## 決まり

決まりはパッケージの中にあり、インストールした版と一緒に変わる。入口は `node_modules/void-kit/docs/index.md`（[GitHub](packages/void-kit/docs/index.md)）。`AGENTS.md` のブロックは、そこを指しているだけ。

## 範囲

- Void の server routes だけ。pages の loader / action はまだ
- 検証は Standard Schema を満たすものなら何でも（zod で確かめた）
- 0.x。実プロダクトで使いながら形を変える。決めたことの理由と未決は [DESIGN.ja.md](DESIGN.ja.md)

## License

MIT
