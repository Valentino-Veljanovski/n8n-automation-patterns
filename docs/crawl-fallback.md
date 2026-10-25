# Bounded crawl as a fallback

A document search from Slack should answer fast. Microsoft Graph search is fast but shallow: a scoped search can miss files in nested folders. The rule is to try the cheapest useful search first and go deeper only when the result is weak.

## Clean the request

Users write "the PDF invoices from last year". The words that name a file type are not search terms; they become the type filter, and the rest becomes the query. A folder hint is cleaned of the characters that break a Graph search string before it is used.

## Rank the folder candidates

When a folder hint matches several folders, each candidate is scored: an exact name match counts most, a full path that contains the hint counts next, and each term found in the name or the path adds a little. The best candidate scopes the file search.

## Crawl with a hard limit

If the scoped search returns too little, a queue-based crawl walks the folder: take the next pending folder, collect its files, enqueue its subfolders, repeat. The crawl stops when the queue is empty or when a fixed number of iterations is reached, and it reports which of the two happened. The limit is the point: the assistant should return a useful answer, not traverse the whole site.

## Guard the delivery

When the user asks for the file itself, the download is checked before the upload: there must be a binary, and it must be under Slack's upload limit. Over the limit, the answer is the link instead of the file.

Implemented in: lib/graph (createCrawlState, takeNextFolder, mergeChildren, rankFolders, filterFilesByType, formatFileResults), lib/text (cleanQuery, cleanFolderQuery), lib/slack (checkUploadSize); dist: none, these run inside the search workflows' own Code nodes
