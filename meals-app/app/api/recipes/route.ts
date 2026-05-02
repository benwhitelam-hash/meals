import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifySession } from '@/lib/auth';
import { listRecipes, createRecipe } from '@/lib/recipes';
import { extractIngredients } from '@/lib/extract';
import { after } from 'next/server';

export const runtime = 'nodejs';

async function getUser(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  return session?.username ?? null;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  try {
    const recipes = await listRecipes();
    return NextResponse.json({ recipes });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'db error', detail: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });

  let body: { name?: string; body_md?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const { name, body_md } = body;
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  if (!body_md?.trim()) {
    return NextResponse.json({ error: 'body_md required' }, { status: 400 });
  }

  try {
    const recipe = await createRecipe({
      created_by: user,
      name: name.trim(),
      body_md: body_md.trim(),
    });

    // Extract ingredients in background — don't block the response
    after(async () => {
      try {
        const ingredients = await extractIngredients(recipe.name, recipe.body_md);
        if (ingredients.length > 0) {
          const { updateRecipe } = await import('@/lib/recipes');
          await updateRecipe(recipe.id, { ingredients });
        }
      } catch (e) {
        console.error('[recipes POST] ingredient extraction failed:', e);
      }
    });

    return NextResponse.json({ recipe });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'db error', detail: message }, { status: 500 });
  }
}
