# void-kit

[Void](https://void.cloud) のアプリのサーバー側を、誰が書いても（AI でも）同じ形にするための決まり。決めるのは、loader・action・route を誰が呼べるか、何を送ってよいか、決まった失敗をどう返すか、業務のルールをどこに置くか。確かめられる決まりは、書いた時点で型か lint が止めて、直し方まで示す。

> 非公式。Void（VoidZero）とは関係ない。

[English](README.md)

## なぜ

AI にバックエンドを書かせると、細かいところが毎回揺れる。ページでサインインを確かめるか、loader がブラウザに何を送るか、失敗をどうフォームに届けるか、ルールをどこに置くか。Void はページ・route・テーブルの置き場所は決めるが、これらは書く人に任せている。void-kit はそれを先に決めて、外れたものを止める。

[hono-kit](https://github.com/ashunar0/hono-kit) の Void 版で、足すものは hono-kit より少ない。Void が持っているもの（ルーティング・検証・フォーム・auth・DB・デプロイ）はそのまま使い、void-kit は Void の部品を「どこで・どの順で呼ぶか」だけを決める。

```ts
// pages/books/[id].server.ts
export const loader = createHandler(
  { auth: requireMember, response: propsSchema }, // 誰が呼べるか、ブラウザに何を送ってよいか
  async (c, { member, now }) => {
    // ...
  },
);

export const actions = {
  borrow: createHandler({ auth: requireMember }, async (c, { member, now }) => {
    const result = await borrowBook(member.id, Number(c.req.param("id")), todayInJapan(now));
    if (!result.ok) throw toHttp(result.error); // 文言は form.error に出る
  }),
};
```

## プリセット

void-kit は npm のパッケージではない。[shadcn/ui](https://ui.shadcn.com) と同じく、ファイルをアプリに写して自分のものとして持つ。何を写して lint をどう有効にするかは、各プリセットの README に書いてある。

| プリセット | 決めること |
| --- | --- |
| [handlers](presets/handlers/README.md) | loader・action・route はすべて `createHandler` で作る。`auth`（必須）は入力の検証より先に走り、handler は呼んだ人（`member`）と時刻（`now`）を受け取る。loader と route の戻り値は `response` のスキーマで確かめる。決まった失敗は `Result` で返し、`toHttp` で HTTP に変える |
| [domains](presets/domains/README.md) | 業務のルールの置き場所（`src/domains/<noun>/`）、どのファイルが何を import してよいか、domain 同士の呼び方。handlers が要る |

AI に書かせるときは、`AGENTS.md` からプリセットの docs をたどれるようにして、「`tsc` と lint を通して」と頼めばよい。

## 状態

- 0.x で、形はまだ動く。別の AI に docs だけで小さなアプリを書かせて、迷った所を集めながら直している
- Void 1.12・React・D1・zod で試している
- 決めたことの理由と未決のこと: [DESIGN.ja.md](DESIGN.ja.md)

## ライセンス

MIT
