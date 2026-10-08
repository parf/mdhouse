/** Which files mdhouse can show, and how — shared by the server's routes and the folder page. */

/** Files `/api/raw` shows: as text, except HTML (rendered, sandboxed). */
export const RAW_EXT = /\.(mmd|mermaid|txt|sql|sh|ya?ml|json|csv|ini|conf|toml|howto|local|log|env|dist|example|readme|html?|css|scss|sass|less)$/i;
export const HTML_EXT = /\.html?$/i;
/** Images `/api/asset` serves. */
export const ASSET_EXT = /\.(png|jpe?g|gif|webp|svg|avif|ico)$/i;
export const MD_EXT = /\.mdx?$/i;
