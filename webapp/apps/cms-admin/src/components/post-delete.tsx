// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Deleting a post, as Ghost Admin's (apps/admin/src/editor/settings/
// delete-section.tsx): a button at the end of the post settings and a
// confirmation naming the post. The CMS deletes drafts only, so nothing public
// disappears unannounced: a scheduled or published post says to unpublish it
// first. The deletion stays in Settings > History.
import { Trash2 } from "lucide-react";
import { useState } from "react";
import type { Post } from "@/api/cms.generated";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function PostDelete({ post, title, onDelete }: {
  post: Post;
  /** The post's title as the posts list shows it, else its heading. */
  title: string;
  /** Deletes the draft and leaves the editor; returns why the CMS refused, if it did. */
  onDelete: () => Promise<string | undefined>;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  if (post.status !== "draft") {
    return (
      <>
        <Button className="w-full" variant="destructive-ghost" disabled><Trash2 />Delete post</Button>
        <p className="text-sm text-text-secondary">Unpublish this post to delete it, so nothing readers can see disappears without notice.</p>
      </>
    );
  }

  const confirm = async () => {
    setDeleting(true);
    setError("");
    const refused = await onDelete();
    // On success the editor leaves; only a refusal keeps the dialog.
    if (refused) {
      setError(refused);
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(value) => { if (!deleting) { setOpen(value); setError(""); } }}>
      <AlertDialogTrigger asChild>
        <Button className="w-full bg-destructive/10 hover:bg-destructive/20" variant="destructive-ghost"><Trash2 />Delete post</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to delete this post?</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;re about to delete &quot;<strong>{title.trim() || "(Untitled)"}</strong>&quot;. This is permanent! We warned you, k?
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={deleting} onClick={() => void confirm()}>Delete</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
