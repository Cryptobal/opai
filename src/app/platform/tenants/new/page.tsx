import { CreateTenantForm } from '@/components/platform/CreateTenantForm';

export default function NewTenantPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Nuevo Tenant</h1>
      <CreateTenantForm />
    </div>
  );
}
