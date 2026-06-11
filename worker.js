// ===================================================================
// ガクツク YouTube中継サーバー（Cloudflare Worker）
//
// 役割: YouTube動画の「音声データ」だけをサーバー側で取り出し、
//       ブラウザが直接読めるよう CORS ヘッダーを付けて返す。
//       これにより、アプリは画面共有ダイアログも音の再生もなしに、
//       リンクを貼った瞬間に内部で音声を読み取って楽譜化できる。
//
// デプロイ手順（無料・5分）:
//   1. https://dash.cloudflare.com にログイン（無料アカウントでOK）
//   2. 左メニュー「Workers & Pages」→「Create application」→「Create Worker」
//   3. 適当な名前を付けて「Deploy」
//   4. 「Edit code」を開き、既定のコードを全部消してこのファイルの内容を貼り付け
//   5. 「Deploy」を押す
//   6. 発行されたURL（例: https://gakutsuku-yt.<あなた>.workers.dev）をコピー
//   7. ガクツクに管理者(master)でログイン →「👑 管理」→ 中継サーバー欄に貼り付けて保存
//
// 使い方（アプリが自動で呼びます）:
//   GET https://<worker>/yt?id=VIDEOID  → 音声データを返す
// ===================================================================

// 音声URLを取得するための公開Piped APIインスタンス（上から順に試す）。
// 動かなくなったら https://github.com/TeamPiped/Piped/wiki/Instances を見て差し替えてください。
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.private.coffee',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.r4fo.com',
  'https://pipedapi.darkness.services',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    if (url.pathname !== '/yt') {
      return new Response('ガクツク YouTube relay is running. Use /yt?id=VIDEO_ID', { headers: CORS });
    }
    const id = url.searchParams.get('id');
    if (!id || !/^[\w-]{11}$/.test(id)) return json({ error: 'invalid id' }, 400);

    // 1) Pipedインスタンスから音声ストリームURLを取得
    let audioUrl = null, lastErr = '';
    for (const inst of PIPED_INSTANCES) {
      try {
        const r = await fetch(`${inst}/streams/${id}`, { cf: { cacheTtl: 300 } });
        if (!r.ok) { lastErr = `${inst}: HTTP ${r.status}`; continue; }
        const j = await r.json();
        const streams = (j.audioStreams || []).filter(s => s.url);
        if (!streams.length) { lastErr = `${inst}: no audio streams`; continue; }
        // ビットレートが中くらいのものを選ぶ（解析には十分で、軽い）
        streams.sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));
        audioUrl = streams[Math.min(1, streams.length - 1)].url;
        break;
      } catch (e) { lastErr = `${inst}: ${e}`; }
    }
    if (!audioUrl) return json({ error: 'no audio source found', detail: lastErr }, 502);

    // 2) 音声本体をサーバー側で取得し、CORSヘッダーを付けてそのまま返す
    try {
      const a = await fetch(audioUrl);
      if (!a.ok) return json({ error: 'audio fetch failed', status: a.status }, 502);
      const headers = new Headers(CORS);
      headers.set('Content-Type', a.headers.get('Content-Type') || 'audio/mp4');
      headers.set('Cache-Control', 'public, max-age=3600');
      return new Response(a.body, { headers });
    } catch (e) {
      return json({ error: 'audio proxy error', detail: String(e) }, 502);
    }
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
