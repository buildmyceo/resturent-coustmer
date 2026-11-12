'use client';

import React, { use } from 'react';
import TableLandingPage from './[uniqueCode]/page';

interface PageProps {
  params: Promise<{
    restaurantSlug: string;
    tableNumber: string;
  }>;
}

export default function TableLandingWithoutToken({ params }: PageProps) {
  const resolved = use(params);
  // Forward to TableLandingPage with a synthesized token
  const wrappedParams = Promise.resolve({
    restaurantSlug: resolved.restaurantSlug,
    tableNumber: resolved.tableNumber,
    uniqueCode: `direct_${resolved.restaurantSlug}_t${resolved.tableNumber}`,
  });

  return <TableLandingPage params={wrappedParams} />;
}
