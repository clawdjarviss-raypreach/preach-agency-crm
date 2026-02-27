import DocDetailClient from "./DocDetailClient";

export default async function DocDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DocDetailClient id={id} />;
}
