import { SupplierForm } from "./SupplierForm";
import { copy } from "@/lib/copy";

export default function SupplierPage() {
  return (
    <div className="grid max-w-xl gap-6">
      <h1 className="text-2xl font-semibold">{copy.supplier.title}</h1>
      <SupplierForm />
    </div>
  );
}
