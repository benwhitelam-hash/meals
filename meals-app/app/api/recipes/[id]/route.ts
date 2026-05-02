import { NextResponse, after } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifySession } from '@/lib/auth';
import { getRecipe, updateRecipe, deleteRecipe } from '@/lib/recipes';
import { extractIngredients } from '@/lib/extract';

export const runtime = 'nodejs';

async function getUser(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  return session?.username ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const { id } = await params;
  try {
    const recipe = await getRecipe(id);
    if (!recipe) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ recipe });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'db error', detail: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const { id } = await params;

  let body: { name?: string; body_md?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.name && !body.body_md) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  try {
    const updated = await updateRecipe(id, {
      ...(body.name ? { name: body.name.trim() } : {}),
      ...(body.body_md ? { body_md: body.body_md.trim() } : {}),
    });
    if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });

    // Re-extract ingredients in background if body changed
    if (body.body_md) {
      after(async () => {
        try {
          const ingredients = await extractIngredients(updated.name, updated.body_md);
          if (ingredients.length > 0) {
            await updateRecipe(updated.id, { ingredients });
          }
        } catch (e) {
          console.error('[recipes PATCH] ingredient extraction failed:', e);
        }
      });
    }

    return NextResponse.json({ recipe: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'db error', detail: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const { id } = await params;
  try {
    const ok = await deleteRecipe(id);
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'db error', detail: message }, { status: 500 });
  }
}
