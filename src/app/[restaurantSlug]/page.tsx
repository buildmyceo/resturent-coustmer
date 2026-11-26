import React from 'react';
import { StorefrontView } from '@/components/store/StorefrontView';

export default async function SlugStorefrontPage({
  params,
}: {
  params: Promise<{ restaurantSlug: string }>;
}) {
  const { restaurantSlug } = await params;
  return <StorefrontView restaurantSlug={restaurantSlug} />;
}
