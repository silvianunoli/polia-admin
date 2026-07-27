import { createFileRoute } from "@tanstack/react-router";
import { PostEditor } from "@/components/blog-admin/PostEditor";

export const Route = createFileRoute("/blog/novo")({
  head: () => ({ meta: [{ title: "Novo post · Blog · Gestão Pólia" }] }),
  component: NovoPost,
});

function NovoPost() {
  return <PostEditor post={null} />;
}
