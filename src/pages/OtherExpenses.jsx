import { useState, useEffect } from "react";
import DatePicker from "../components/DatePicker";
import { ipc } from "../lib/ipc";
import {
  Plus,
  Receipt,
  Trash2,
  Download,
  Calendar,
  Search,
  Tag,
  Edit2,
} from "lucide-react";
import { otherExpenseSchema } from "../lib/schemas";
import { formatCurrency, formatDate } from "../lib/formatters";
import { toast } from "sonner";
import Skeleton from "../components/Skeleton";
import ConfirmDialog from "../components/ConfirmDialog";
import CategorySelect from "../components/CategorySelect";

export default function OtherExpenses() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Form States
  const [categoryId, setCategoryId] = useState("");
  const [moneySpent, setMoneySpent] = useState("");
  const [moneyGained, setMoneyGained] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  // Category Panel States
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState(null);

  // Confirm dialog state for expenses
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  // Confirm dialog state for categories
  const [categoryConfirmOpen, setCategoryConfirmOpen] = useState(false);
  const [deleteCategoryId, setDeleteCategoryId] = useState(null);

  // Filter States
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  async function loadCategories() {
    try {
      const cats = await ipc("expense-categories:list");
      setCategories(cats || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load categories");
    }
  }

  async function loadExpenses() {
    setLoading(true);
    const hasFilter = dateFrom || dateTo || search || categoryFilter;
    const filters = {
      limit: hasFilter ? 100000 : 50,
      offset: 0,
      date_from: dateFrom || null,
      date_to: dateTo || null,
      search: search || null,
      category_id: categoryFilter ? Number(categoryFilter) : null,
    };
    try {
      const data = await ipc("other-expenses:list", filters);
      setExpenses(data || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadExpenses();
  }, [page, dateFrom, dateTo, search, categoryFilter]);

  async function handleSubmit(e) {
    e.preventDefault();

    const expenseData = {
      category_id: categoryId ? Number(categoryId) : null,
      money_spent: moneySpent ? Number(moneySpent) : 0,
      money_gained: moneyGained ? Number(moneyGained) : 0,
      reason,
      date,
    };

    const result = otherExpenseSchema.safeParse(expenseData);
    if (!result.success) {
      return toast.error(result.error.errors[0].message);
    }

    if (expenseData.money_spent === 0 && expenseData.money_gained === 0) {
      return toast.error("You must specify either money spent or money gained");
    }

    setSaving(true);
    try {
      await ipc("other-expenses:add", {
        ...expenseData,
        money_spent: Math.round(expenseData.money_spent * 100),
        money_gained: Math.round(expenseData.money_gained * 100),
      });
      setCategoryId("");
      setMoneySpent("");
      setMoneyGained("");
      setReason("");
      setDate(new Date().toISOString().slice(0, 10));
      setPage(1);
      loadExpenses();
      toast.success("Expense record added successfully");
    } catch (err) {
      console.error(err);
      toast.error("Failed to add expense");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(id) {
    setDeleteId(id);
    setConfirmOpen(true);
  }

  async function handleDelete() {
    try {
      await ipc("other-expenses:delete", deleteId);
      setConfirmOpen(false);
      loadExpenses();
      toast.success("Expense record deleted");
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete expense record");
    }
  }

  // Category Handlers
  async function handleCreateCategory(name) {
    if (!name.trim()) return;
    try {
      const newCat = await ipc("expense-categories:add", { name: name.trim() });
      toast.success("Category created");
      await loadCategories();
      return newCat;
    } catch (err) {
      console.error(err);
      toast.error("Failed to create category. It might already exist.");
      return null;
    }
  }

  async function handleSaveCategory(e) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    if (editingCategory) {
      try {
        await ipc("expense-categories:update", {
          id: editingCategory.id,
          name: newCategoryName.trim(),
        });
        toast.success("Category updated");
        setEditingCategory(null);
        setNewCategoryName("");
        loadCategories();
        loadExpenses(); // Refresh in case names changed in view
      } catch (err) {
        console.error(err);
        toast.error("Failed to update category");
      }
    } else {
      const created = await handleCreateCategory(newCategoryName);
      if (created) setNewCategoryName("");
    }
  }

  async function confirmCategoryDelete(id) {
    setDeleteCategoryId(id);
    setCategoryConfirmOpen(true);
  }

  async function handleDeleteCategory() {
    try {
      await ipc("expense-categories:delete", deleteCategoryId);
      setCategoryConfirmOpen(false);
      loadCategories();
      loadExpenses();
      toast.success("Category deleted");
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete category");
    }
  }

  const handleExportExcel = async () => {
    try {
      const filters = {
        limit: 100000,
        date_from: dateFrom || null,
        date_to: dateTo || null,
        search: search || null,
        category_id: categoryFilter ? Number(categoryFilter) : null,
      };
      const data = await ipc("other-expenses:list", filters);
      if (!data || data.length === 0) {
        return toast.error("No expense data to export");
      }

      const headers = [
        "ID",
        "Date",
        "Category",
        "Reason",
        "Money Spent (₹)",
        "Money Gained (₹)",
      ];
      const rows = data.map((exp) => [
        exp.id,
        formatDate(exp.date),
        exp.category_name || "-",
        exp.reason,
        exp.money_spent / 100,
        exp.money_gained / 100,
      ]);

      const success = await ipc(
        "app:export-excel",
        "Other_Expenses",
        headers,
        rows,
      );
      if (success) {
        toast.success("Other expenses list exported successfully");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to export expenses list");
    }
  };

  const pageSpentTotal = expenses.reduce(
    (sum, e) => sum + (Number(e.money_spent) || 0),
    0,
  );
  const pageGainedTotal = expenses.reduce(
    (sum, e) => sum + (Number(e.money_gained) || 0),
    0,
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Receipt className="w-6 h-6 text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-800">Other Expenses</h1>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Expenses Section */}
        <div className="flex-1 space-y-6">
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-gray-200 rounded-xl p-5 space-y-3 shadow-sm"
          >
            <h2 className="font-bold text-gray-800 text-sm uppercase tracking-wider mb-2">
              Record Expense/Income
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <CategorySelect
                value={categoryId}
                onChange={setCategoryId}
                categories={categories}
                onCreateCategory={handleCreateCategory}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <input
                placeholder="Reason / Description"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Money Spent (₹)"
                value={moneySpent}
                onChange={(e) => setMoneySpent(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Money Gained (₹)"
                value={moneyGained}
                onChange={(e) => setMoneyGained(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <DatePicker
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 md:col-span-2"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />{" "}
              {saving ? "Recording..." : "Record Entry"}
            </button>
          </form>
        </div>

        {/* Categories Sidebar */}
        <div className="w-full lg:w-80 flex-shrink-0">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm sticky top-6">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-600" />
                <h2 className="font-bold text-gray-800 text-sm uppercase tracking-wider">
                  Categories
                </h2>
              </div>
            </div>

            <div className="p-4 border-b border-gray-100">
              <form onSubmit={handleSaveCategory} className="flex gap-2">
                <input
                  type="text"
                  placeholder="New category..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={!newCategoryName.trim()}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {editingCategory ? "Update" : "Add"}
                </button>
                {editingCategory && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategory(null);
                      setNewCategoryName("");
                    }}
                    className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </form>
            </div>

            <div className="overflow-auto max-h-[calc(100vh-250px)]">
              <ul className="divide-y divide-gray-100">
                {categories.length === 0 ? (
                  <li className="p-6 text-center text-sm text-gray-400 italic">
                    No categories created yet
                  </li>
                ) : (
                  categories.map((cat) => (
                    <li
                      key={cat.id}
                      className="flex items-center justify-between p-3 hover:bg-gray-50 group"
                    >
                      <span className="text-sm font-semibold text-gray-700">
                        {cat.name}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setEditingCategory(cat);
                            setNewCategoryName(cat.name);
                          }}
                          className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => confirmCategoryDelete(cat.id)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <span className="font-bold text-gray-700 text-sm">Expenses Log</span>
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>

        <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-150 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center flex-wrap gap-2">
            <Calendar className="w-4 h-4 text-gray-450 shrink-0" />
            <DatePicker
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1 border border-gray-300 rounded-xl text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-slate-800"
            />
            <span className="text-xs font-bold text-gray-400">to</span>
            <DatePicker
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1 border border-gray-300 rounded-xl text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-slate-800"
            />
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1 border border-gray-300 rounded-xl text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-slate-800 ml-2"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {(dateFrom || dateTo || categoryFilter) && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setCategoryFilter("");
                  setPage(1);
                }}
                className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-650 hover:text-red-750 rounded-xl text-xs font-bold transition-colors uppercase tracking-wider shadow-sm"
              >
                Clear
              </button>
            )}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by reason..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
            />
          </div>
        </div>

        <div className="overflow-auto max-h-[calc(100vh-200px)]">
          <table className="w-full text-sm relative">
            <thead className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider shadow-[0_1px_0_0_#e5e7eb]">
              <tr>
                <th className="text-left px-5 py-3 w-16">S. No.</th>
                <th className="text-left px-5 py-3 w-32">Date</th>
                <th className="text-left px-5 py-3 w-40">Category</th>
                <th className="text-left px-5 py-3">Reason</th>
                <th className="text-right px-5 py-3 w-36">Money Spent</th>
                <th className="text-right px-5 py-3 w-36">Money Gained</th>
                <th className="text-center px-5 py-3 w-20">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-5 py-3">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : (
                <>
                  {expenses.map((exp, index) => (
                    <tr
                      key={exp.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-5 py-3 text-gray-500 font-medium">
                        {(page - 1) * 50 + index + 1}
                      </td>
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                        {formatDate(exp.date)}
                      </td>
                      <td className="px-5 py-3 text-gray-600 font-medium">
                        {exp.category_name ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            {exp.category_name}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-5 py-3 font-semibold text-gray-800">
                        {exp.reason}
                      </td>
                      <td className="px-5 py-3 text-right text-red-650 font-bold">
                        {exp.money_spent > 0
                          ? formatCurrency(exp.money_spent)
                          : "-"}
                      </td>
                      <td className="px-5 py-3 text-right text-green-600 font-bold">
                        {exp.money_gained > 0
                          ? formatCurrency(exp.money_gained)
                          : "-"}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <button
                          onClick={() => confirmDelete(exp.id)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {expenses.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center py-12 text-gray-400 italic"
                      >
                        No entries recorded
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
            {!loading && expenses.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200 text-xs font-bold text-gray-700">
                <tr>
                  <td
                    className="px-5 py-3 text-gray-900 font-black uppercase tracking-wider"
                    colSpan={4}
                  >
                    Total
                  </td>
                  <td className="px-5 py-3 text-right font-black text-red-650 whitespace-nowrap">
                    {formatCurrency(pageSpentTotal)}
                  </td>
                  <td className="px-5 py-3 text-right font-black text-green-600 whitespace-nowrap">
                    {formatCurrency(pageGainedTotal)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Delete Expense Entry?"
        message="Are you sure you want to delete this expense record? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
        confirmText="Delete Record"
      />

      <ConfirmDialog
        isOpen={categoryConfirmOpen}
        title="Delete Category?"
        message="Are you sure you want to delete this category? Associated expenses will lose their category tag."
        onConfirm={handleDeleteCategory}
        onCancel={() => setCategoryConfirmOpen(false)}
        confirmText="Delete Category"
      />
    </div>
  );
}
