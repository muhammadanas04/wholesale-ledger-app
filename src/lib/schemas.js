import { z } from 'zod'

export const customerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
})

export const productSchema = z.object({
  name: z.string().min(2, 'Product name required'),
  unit: z.enum(['kg', 'g', 'box', 'piece', 'litre', 'bottle', 'bag', 'dozen']),
  reorder_level: z.number().nonnegative().default(0),
})

export const saleItemSchema = z.object({
  product_id: z.number().positive(),
  qty: z.number().positive('Quantity must be greater than 0'),
  unit_price: z.number().positive('Price must be greater than 0'),
  weight: z.number().positive('Weight must be greater than 0').optional().nullable(),
})

export const saleSchema = z.object({
  customer_id: z.number().positive('Please select a customer'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  notes: z.string().nullable(),
  items: z.array(saleItemSchema).min(1, 'At least one item is required'),
  discount: z.number().nonnegative('Discount must be a positive number').optional().nullable(),
})

export const paymentSchema = z.object({
  customer_id: z.number().positive('Please select a customer'),
  amount: z.number().positive('Amount must be greater than 0'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  notes: z.string().nullable(),
  discount: z.number().nonnegative('Discount must be a positive number').optional().nullable(),
})

export const stockPurchaseSchema = z.object({
  product_id: z.number().positive('Please select a product'),
  qty: z.number().positive('Quantity must be greater than 0'),
  cost_price: z.number().positive('Cost price must be greater than 0'),
  supplier: z.string().optional().or(z.literal('')),
  firm_name: z.string().optional().or(z.literal('')),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  weight: z.number().positive('Weight must be greater than 0').optional().nullable(),
})
