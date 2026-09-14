/** markdown-it-footnote ships no types; it is a plain markdown-it plugin. */
declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it';
  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}
