# Solid Data Manager

![Solid Data Manager](1.png)

Testinstanz: https://solid-data-manager.tmdt.info

Solid Data Manager is a standalone React application for managing files in a Solid Pod. It provides a simple UI for browsing, uploading, downloading, and organizing resources in a Pod, and can also be embedded as a library in other applications.

## Features

- File and folder browsing for Solid Pods
- Upload, download, and delete resources
- Embedded mode via a lightweight bundle
- Solid authentication integration (Inrupt client libraries)
- SPA routing with static hosting support (Nginx)

## Direct links and Pod discovery

Open a container or file with `?uri=` containing an absolute URL encoded with
`encodeURIComponent`, for example:

```js
const link = new URL('https://your-app.example/solid-data-manager/');
link.searchParams.set('uri', 'https://storage.example/alice/documents/report.csv');
```

A container opens directly. A file opens its containing folder and selects the
file; use **Preview** or **Download** as usual. Existing Pod permissions apply.
Opening a link only reads resources; it never creates containers or changes ACLs.
The destination is kept in the login return URL, with a tab-local callback fallback
that expires after 30 minutes. Invalid or inaccessible targets produce an error.

Pod discovery reads `pim:storage` from the WebID profile (including alternate
profiles), so the WebID and storage may use different hosts. With multiple Pods,
the link chooses the containing storage; without a link the first advertised
storage is opened. Links outside those storages discover the root using the
server's `Link: <http://www.w3.org/ns/pim/space#Storage>; rel="type"` header on
ancestor containers. Existing `/profile/` WebIDs without storage links retain
the legacy root fallback. Profile failures do not silently choose an identity
server as storage. URLs must use HTTP(S), without credentials or query parameters;
RDF fragments are removed when opening the document. Containers normally end in
`/`; a server redirect or container type header also identifies a slashless URL.

Embedded callers can pass `uri` to `<DataManagerEmbed webId={webId} uri={url} />`.
Omitting it reads the browser's `?uri=` parameter; `uri={null}` opens the default
Pod. Browser history changes to `?uri=` are supported.

## Downloads

Select a folder and choose **Download** in the selection toolbar or context menu
to save a ZIP containing its files, subfolders and empty folders. A mixed
selection of folders and files produces one ZIP; selecting only files keeps the
individual file downloads. All reads use the current Solid session.

A progress display offers cancellation. Unreadable or missing resources stop the
archive download instead of silently producing an incomplete ZIP. Archives are
limited to 256 MiB of input/output, 10,000 entries and 64 nested folder levels to
bound browser memory and traversal. No Pod data or permissions are changed.

## Installation (Docker)

### Production

Build and run the production container:

```bash
docker compose up --build
```

The app is served on port `3002` by default and is reachable at `http://localhost:3002`.

### Development

Run the dev container with live code mounting:

```bash
docker compose -f docker-compose.dev.yaml up --build
```

### Configuration

- `FRONTEND_PORT` (default: `3002`) controls the host port mapped to the container.
- For production image builds you can also set `PUBLIC_URL` (default: `/solid-data-manager`).

## Embedding

The embed entrypoint is exported as `@hoelk-f/solid-data-manager/embed` and exposes:

- `DataManagerEmbed` - router-free component (requires `webId` prop)
- `setSession` - optional override to inject a host session instance
- `@hoelk-f/solid-data-manager/embed.css` - styles for the embedded Data Manager

Example:

```js
import { DataManagerEmbed, setSession } from "@hoelk-f/solid-data-manager/embed";
import "@hoelk-f/solid-data-manager/embed.css";
import session from "./solidSession";

setSession(session);

<DataManagerEmbed webId={webId} />;
```

## Acknowledgements

This work has been supported as part of the research project _Gesundes Tal_ in collaboration with the city of Wuppertal, funded by the Federal Ministry of Housing, Urban Development and Building (BMWSB) and the Reconstruction Loan Corporation (KfW) through the funding program “Modellprojekte Smart Cities: Stadtentwicklung und Digitalisierung” (grant number 19454890).

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).


## Citation

If you use this repository, please cite it using the metadata in [CITATION.cff](CITATION.cff).

### Renaming folders with contents

Folder renames use authenticated Solid requests and the Data Connection relocation coordinator (`/sync-worker/participants/relocations`). The access gateway, worker, and Data Manager must be deployed together. The coordinator temporarily gates that owner's periodic connections, streams and managed imports, without changing enabled flags or schedules. A standalone deployment without this coordinator fails before changing Pod data.

Before copying, the browser stores an IndexedDB recovery journal and downloads a ZIP containing original files, ACLs, metadata, affected catalog/connection documents and SHA-256 checksums. The worker retains its original encrypted import definitions in its relocation journal. The browser verifies copied bytes, preserves explicit and inherited WAC policies, updates same-Pod `catalog/` Turtle references and direct `connections/` and `connections/test/` configuration documents, and retargets managed-import destinations and source settings. Original files are deleted only after those steps, with conditional requests. Connection history index locations follow the rename; measurements and ordinary file contents remain unchanged.

Keep the same browser profile for recovery. An interrupted operation appears as **Resume rename**; its writer gate does not expire automatically. Do not clear site storage while it is pending. A lost/conflicting journal requires operator recovery from the downloaded backup and the worker's `resource_moves` table. The coordinator has no authority over unrelated external writers or references in other Pods/applications; those need separate coordination.

The preview worker restricts folder renames to `connections/test/` because Test and Prod share Pods. Pod roots, application system folders and the connection namespace roots cannot be renamed. A managed import must move as a whole target folder. Limits are 128 MiB of backed-up resources, 10,000 reads during discovery and 64 folder levels. Missing control rights, inaccessible references, conflicting destinations and concurrent changes stop the operation. Folder rename does not change the existing single-file rename behavior.
