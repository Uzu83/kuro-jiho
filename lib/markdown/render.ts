import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { remark } from "remark";
import remarkRehype from "remark-rehype";

/**
 * Markdown を HTML にする。生 HTML は remark-rehype で捨て、
 * 残ったノードは rehype-sanitize の既定スキーマでさらに落とす。
 * 呼び出し側が raw HTML を有効にする引数は持たない。
 */
export async function renderMarkdown(markdown: string): Promise<string> {
  const file = await remark()
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .process(markdown);

  return String(file);
}
