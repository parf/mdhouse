import { follow } from './PageHead';

/**
 * Create new Project (`/<root>/?new-project`): not built yet — the owner's TBD page. It says what creating a project will
 * ask and which flows will follow, and points to Add new Project for a folder that exists. It creates nothing.
 */
export function NewProjectPage({ go, backUrl, gear }: { go: (url: string) => void; backUrl: string; gear?: preact.ComponentChildren }) {
  const add = '/settings#add-project';
  return (
    <div class="settings new-project">
      <header class="home-head">
        <h1>Create new Project</h1>
        <span class="head-gear">{gear}</span>
      </header>
      <p class="settings-hint">
        <a href={backUrl} onClick={(e) => follow(e, () => go(backUrl))}>
          ← Back
        </a>
      </p>
      <p class="new-project-tbd" role="status">
        Not available yet: creating a project is still being designed. Nothing here makes a folder or changes your files.
      </p>
      <p>
        A folder that already exists?{' '}
        <a href={add} onClick={(e) => follow(e, () => go(add))}>
          Add new Project
        </a>{' '}
        serves it now.
      </p>
      <section>
        <h2>What it will ask</h2>
        <ul>
          <li>Where the project lives — a new folder, and its name</li>
          <li>Read and write, or read-only; kept after a restart, or this session only</li>
          <li>Start it as a git repository, or not</li>
          <li>What to start from — an empty project, or a plan or template</li>
        </ul>
      </section>
      <section>
        <h2>What may follow</h2>
        <ul>
          <li>A first plan for the project, through its own questions</li>
          <li>Flows to run on it once it has history — from Run Flow</li>
        </ul>
      </section>
    </div>
  );
}
