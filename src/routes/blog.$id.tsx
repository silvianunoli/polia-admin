import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { BlogPost } from "@/lib/blog-types";
import { PostEditor } from "@/components/blog-admin/PostEditor";

export const Route = createFileRoute("/blog/$id")({
  head: () => ({ meta: [{ title: "Editar post · Blog · Gestão Pólia" }] }),
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (!data) throw redirect({ to: "/blog" });
    return { post: data as BlogPost };
  },
  component: EditarPost,
});

function EditarPost() {
  const { post } = Route.useLoaderData();
  return <PostEditor post={post} />;
}
