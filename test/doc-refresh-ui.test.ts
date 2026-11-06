import { expect, test } from 'bun:test';
import { docMetadataRevision, docRefreshTicket, mergeDocRefresh } from '../src/ui/doc-refresh';
import type { DocMetadata, DocMetadataFields, DocPayload, DocUnchanged } from '../src/ui/api';

function document(): DocPayload {
  return { kind:'md', root:'r', rel:'README.md', url:'/r/README.md', raw:'/api/raw?p=r/README.md', writable:true,
    frontmatter:'title: Title', lineOffset:3, mtime:100, size:200, marks:[], html:'<p data-act="original-token">current source</p>',
    headings:[{level:1,text:'Title',slug:'title',line:1}], hasMermaid:true, actToken:'original-token',
    tasks:{done:0,total:1}, contentHash:'a'.repeat(64), gitRevision:'1'.repeat(40) };
}
function metadata(d: DocPayload): DocMetadataFields {
  return {kind:d.kind,root:d.root,rel:d.rel,url:d.url,raw:d.raw,writable:d.writable,mtime:d.mtime,size:d.size,
    marks:[...d.marks],gitRevision:d.gitRevision ?? null,
    ...(d.status ? {status:d.status} : {}), ...(d.gitState ? {gitState:d.gitState} : {}),
    ...(d.reference === undefined ? {} : {reference:d.reference})};
}
function updated(d: DocPayload, reply: DocMetadata | DocUnchanged | DocPayload): DocPayload {
  const result=mergeDocRefresh(d,reply,docRefreshTicket(d,1),1); expect(result.kind).toBe('update');
  if(result.kind!=='update')throw new Error('fixture'); return result.doc;
}

test('git metadata changes preserve the actual current body, token and nested body references', () => {
  const d=document();const before=structuredClone(d);
  const meta:DocMetadata={...metadata(d),meta:true,status:'modified',gitRevision:'2'.repeat(40),mtime:101,writable:false,marks:['favorite']};
  const next=updated(d,meta);
  expect(next.html).toBe(d.html);expect(next.actToken).toBe(d.actToken);expect(next.headings).toBe(d.headings);
  expect(next.tasks).toBe(d.tasks);expect(next.frontmatter).toBe(d.frontmatter);expect(next.contentHash).toBe(d.contentHash);
  expect(next.status).toBe('modified');expect(next.writable).toBe(false);expect(next.marks).toEqual(['favorite']);
  meta.marks.push('muted');expect(next.marks).toEqual(['favorite']);expect(d).toEqual(before);
});

test('repeated identical metadata returns the same payload and stable history dependency, not an event counter', () => {
  const d=document();const first=updated(d,{...metadata(d),meta:true});expect(first).toBe(d);
  expect(docMetadataRevision(first)).toBe(docMetadataRevision(d));
  for(let i=0;i<20;i++)expect(updated(first,{...metadata(first),meta:true})).toBe(first);
  const cleanCommit=updated(d,{...metadata(d),meta:true,gitRevision:'2'.repeat(40)});
  expect(cleanCommit.status).toBeUndefined();expect(docMetadataRevision(cleanCommit)).not.toBe(docMetadataRevision(d));
  expect(docMetadataRevision({...cleanCommit,mtime:999,size:900,marks:['muted']})).toBe(docMetadataRevision(cleanCommit));
  expect(docMetadataRevision({...cleanCommit,status:'modified'})).not.toBe(docMetadataRevision(cleanCommit));
  expect(docMetadataRevision({...cleanCommit,gitState:'ignored'})).not.toBe(docMetadataRevision(cleanCommit));
  expect(docMetadataRevision(null)).toBeNull();expect(docMetadataRevision({...d,gitRevision:null})).toBeNull();
});

test('absent status/gitState/reference removes stale flags rather than carrying them into the new metadata', () => {
  const d={...document(),status:'untracked' as const,gitState:'ignored' as const,reference:true};
  const plain=document();const next=updated(d,{...metadata(plain),meta:true});
  expect(next).not.toHaveProperty('status');expect(next).not.toHaveProperty('gitState');expect(next).not.toHaveProperty('reference');
  expect(next.html).toBe(d.html);expect(next.actToken).toBe(d.actToken);
});

test('server-confirmed unchanged source retains body/provenance while stat and Git metadata update', () => {
  const d=document();const next=updated(d,{...metadata(d),unchanged:true,contentHash:d.contentHash!,mtime:200,size:201,status:'staged'});
  expect(next.headings).toBe(d.headings);expect(next.tasks).toBe(d.tasks);expect(next.html).toBe(d.html);expect(next.actToken).toBe(d.actToken);
  expect(next.size).toBe(201);expect(next.status).toBe('staged');
  const ticket=docRefreshTicket(d,1);
  expect(mergeDocRefresh(d,{...metadata(d),unchanged:true,contentHash:'b'.repeat(64)},ticket,1).kind).toBe('reload');
  const noHash={...d,contentHash:undefined};
  expect(mergeDocRefresh(noHash,{...metadata(d),unchanged:true,contentHash:d.contentHash!},docRefreshTicket(noHash,1),1).kind).toBe('reload');
});

test('changed source/frontmatter and explicit full context reload use the new body/token even when text hash matches', () => {
  const d=document();const full={...d,html:'<p data-act="new-token">new text</p>',actToken:'new-token',contentHash:'b'.repeat(64),frontmatter:'title: Changed',headings:[],tasks:{done:1,total:1}};
  expect(updated(d,full)).toBe(full);expect(updated(d,full).actToken).toBe('new-token');
  const contextReload={...full,contentHash:d.contentHash};
  expect(updated(d,contextReload).html).toBe(full.html);expect(updated(d,contextReload).actToken).toBe('new-token');
});

test('kind changes demand full reload for metadata/unchanged, but full new-kind payload replaces the old body', () => {
  const d=document();const ticket=docRefreshTicket(d,1);
  expect(mergeDocRefresh(d,{...metadata(d),meta:true,kind:'html'},ticket,1).kind).toBe('reload');
  expect(mergeDocRefresh(d,{...metadata(d),unchanged:true,contentHash:d.contentHash!,kind:'text'},ticket,1).kind).toBe('reload');
  const full={...d,kind:'text' as const,html:'<pre>text</pre>',hasMermaid:false,actToken:undefined};
  expect(updated(d,full)).toBe(full);
});

test('stale request generation, navigation, cross-root/path and newer source hashes reject old metadata', () => {
  const d=document();const ticket=docRefreshTicket(d,10);const meta:DocMetadata={...metadata(d),meta:true,status:'modified'};
  for(const current of [null,{...d,root:'other'},{...d,rel:'other.md'},{...d,url:'/other'}, {...d,contentHash:'b'.repeat(64)}]) {
    expect(mergeDocRefresh(current,meta,ticket,10).kind).toBe('ignore');
  }
  expect(mergeDocRefresh(d,meta,ticket,11).kind).toBe('ignore');
  for(const reply of [{...meta,root:'other'},{...meta,rel:'other.md'},{...meta,url:'/other'}]) expect(mergeDocRefresh(d,reply,ticket,10).kind).toBe('ignore');
  expect(d.status).toBeUndefined();expect(d.actToken).toBe('original-token');
});

test('metadata can never inject a new renderer body/token via unexpected body fields', () => {
  const d=document();const reply={...metadata(d),meta:true as const,html:'forged',actToken:'forged',headings:[],tasks:{done:9,total:9}};
  const next=updated(d,reply);expect(next.html).toBe(d.html);expect(next.actToken).toBe(d.actToken);
  expect(next.headings).toBe(d.headings);expect(next.tasks).toBe(d.tasks);
});
