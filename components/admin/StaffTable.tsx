"use client";

import { useState } from "react";
import AddEmployeeModal from "./AddEmployeeModal";
import { resetEmployeePassword } from "@/app/admin/actions";

type Staff = { id: string; name: string; role: string };

export default function StaffTable({ staff, isAdmin }: { staff: Staff[]; isAdmin: boolean }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const handleReset = async (id: string, name: string) => {
    if (!confirm(`Reset ${name}'s password?`)) return;
    setResettingId(id);
    try {
      const { newTemporaryPassword } = await resetEmployeePassword(id);
      alert(`New temporary password for ${name}: ${newTemporaryPassword}`);
    } catch (e: any) {
      alert(e.message ?? "Couldn't reset password.");
    } finally {
      setResettingId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-black/[0.02] text-brand-ink/50 text-sm">
          <tr>
            <th className="px-5 py-3 font-medium">Name</th>
            <th className="px-5 py-3 font-medium">Role</th>
            {isAdmin && <th className="px-5 py-3 font-medium">&nbsp;</th>}
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id} className="border-t border-black/5">
              <td className="px-5 py-3 font-medium text-brand-ink">{s.name}</td>
              <td className="px-5 py-3 text-brand-ink/60 capitalize">{s.role}</td>
              {isAdmin && (
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => handleReset(s.id, s.name)}
                    disabled={resettingId === s.id}
                    className="text-brand-sky text-sm font-semibold disabled:opacity-50"
                  >
                    {resettingId === s.id ? "Resetting…" : "Reset password"}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {isAdmin && (
        <div className="p-4 border-t border-black/5">
          <button
            onClick={() => setModalOpen(true)}
            className="min-h-[40px] px-4 rounded-lg bg-brand-sky text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            + Add employee
          </button>
        </div>
      )}

      {modalOpen && <AddEmployeeModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
