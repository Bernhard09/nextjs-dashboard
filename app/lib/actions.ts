'use server';

import { z } from 'zod';
import postgres from 'postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
 

const sql = postgres(process.env.POSTGRES_URL!, {ssl: 'require'});


// Define the schema for the invoice form
// This schema will be used to validate the form data
const FormSchema = z.object({
    id: z.string(),
    customer_id: z.string({
        invalid_type_error: 'Customer ID must be a string',
    }),
    amount: z.coerce
    .number()
    .gt(0 ,{ message: 'Please enter an amount greater than $0'}), // coerce to number
    status: z.enum(['pending', 'paid'], {
        invalid_type_error: 'Please select an invoice status.',
    }),
    date: z.string(),
});

export type State = {
    errors?: {
        customer_id?: string[];
        amount?: string[];
        status?: string[];
    };
    message?: string | null;

}


// Define the schema for the create invoice form
const CreateInvoice = FormSchema.omit({id: true, date: true});



// Define the schema for the update invoice form
export async function createInvoice(prevState: State, formData: FormData)  {
    // const rawFormData = {
    //     customer_id: formData.get('customerId'),
    //     amount: formData.get('amount'),
    //     status: formData.get('status'),
    // };
    // const rawFormData = Object.fromEntries(formData.entries());

    const validatedFields = CreateInvoice.safeParse({
        customer_id: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Missing Fields. Failed to Create Invoice',
        }
    }

    const { customer_id, amount, status } = validatedFields.data;

    const amountInCents = amount * 100;
    const date = new Date().toISOString().split('T')[0];
    try {
        await sql`
            INSERT INTO invoices (customer_id, amount, status, date)
            VALUES (${customer_id}, ${amountInCents}, ${status}, ${date})
        `;
    } catch(e) {
        return {
            message: 'Database Error: Failed to Create Invoice.',
          };
    }
    revalidatePath('/dashboard/invoices'); // revalidate the invoices page
    redirect('/dashboard/invoices'); // redirect to the invoices page

    // console.log('rawFormData', rawFormData);
}

// Define the schema for the update invoice form
const UpdateInvoice =  FormSchema.omit({ id: true, date: true });

export async function updateInvoice(id: string, formData: FormData) {
    const { customer_id, amount, status } = UpdateInvoice.parse({
        customer_id: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    const amountInCents = amount * 100;
    try {
        await sql`
            UPDATE invoices
            SET customer_id = ${customer_id}, amount = ${amountInCents}, status = ${status}
            WHERE id = ${id}
        `;
    } catch(e) {
        console.error(`$Error Occured While Updating an Invoice: ${e}`);
    }

    revalidatePath('dashboard/invoices'); // revalidate the invoices page
    redirect('/dashboard/invoices'); // redirect to the invoices page
}

export async function deleteInvoice(id: string) {
    // throw new Error('Failed to Delete Invoice');

    await sql`DELETE FROM invoices WHERE id = ${id}`;
    revalidatePath('/dashboard/invoices'); // revalidate the invoices page

}

export async function authenticate(
    prevState: string | null | undefined,
    formData: FormData,
) {
    try {
        await signIn('credentials', formData);
    } catch (error) {   
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Invalid Credentials';
                default:
                    return 'Something went wrong';
            }
        }
        throw error;
    }
}
