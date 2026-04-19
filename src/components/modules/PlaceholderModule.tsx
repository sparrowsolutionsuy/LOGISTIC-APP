import React from 'react';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Construction } from 'lucide-react';

export interface PlaceholderModuleProps {
  title: string;
  description: string;
}

export const PlaceholderModule: React.FC<PlaceholderModuleProps> = ({
  title,
  description,
}) => {
  return (
    <Card title={title} padding="lg">
      <EmptyState
        icon={<Construction className="h-10 w-10" />}
        title="Módulo en construcción"
        description={description}
      />
    </Card>
  );
};
