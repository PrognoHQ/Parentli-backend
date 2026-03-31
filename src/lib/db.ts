import { prisma } from "./prisma";
import { BootstrapResponse } from "../types";

interface BootstrapRow {
  profile_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  avatar_url: string | null;
  household_id: string | null;
  household_name: string | null;
  household_status: string | null;
  timezone: string | null;
  handoff_time_default: string | null;
  membership_role: string | null;
  membership_status: string | null;
  joined_at: Date | null;
  current_step: string | null;
  completed_steps: unknown | null;
  is_complete: boolean | null;
  onboarding_payload: unknown | null;
  settings: unknown | null;
  categories: Array<{
    id: string;
    slug: string;
    label: string;
    emoji: string;
    color: string;
    position: number;
    isDefault: boolean;
  }> | null;
}

export async function fetchBootstrapData(
  profileId: string,
  householdId: string
): Promise<BootstrapResponse | null> {
  const rows = await prisma.$queryRaw<BootstrapRow[]>`
    SELECT
      p.id AS profile_id,
      p.email,
      p.first_name,
      p.last_name,
      p.phone,
      p.avatar_url,
      h.id AS household_id,
      h.name AS household_name,
      h.status AS household_status,
      h.timezone,
      h.handoff_time_default,
      hm.role AS membership_role,
      hm.status AS membership_status,
      hm.joined_at,
      os.current_step,
      os.completed_steps,
      os.is_complete,
      os.payload AS onboarding_payload,
      us.settings,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', c.id,
              'slug', c.slug,
              'label', c.label,
              'emoji', c.emoji,
              'color', c.color,
              'position', c.position,
              'isDefault', c.is_default
            ) ORDER BY c.position
          )
          FROM categories c
          WHERE c.household_id = h.id AND c.archived_at IS NULL
        ),
        '[]'::json
      ) AS categories
    FROM profiles p
    JOIN household_members hm ON hm.profile_id = p.id
    JOIN households h ON h.id = hm.household_id
    LEFT JOIN onboarding_state os ON os.profile_id = p.id AND os.household_id = h.id
    LEFT JOIN user_settings us ON us.profile_id = p.id AND us.household_id = h.id
    WHERE p.id = ${profileId}::uuid
      AND h.id = ${householdId}::uuid
  `;

  if (rows.length === 0) return null;

  const row = rows[0];

  return {
    profile: {
      id: row.profile_id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      avatarUrl: row.avatar_url,
    },
    household: row.household_id
      ? {
          id: row.household_id,
          name: row.household_name!,
          status: row.household_status!,
          timezone: row.timezone,
          handoffTimeDefault: row.handoff_time_default,
        }
      : null,
    membership: row.membership_role
      ? {
          role: row.membership_role,
          status: row.membership_status!,
          joinedAt: row.joined_at!.toISOString(),
        }
      : null,
    onboarding: row.current_step != null
      ? {
          currentStep: row.current_step,
          completedSteps: row.completed_steps,
          isComplete: row.is_complete!,
          payload: row.onboarding_payload,
        }
      : null,
    settings: row.settings,
    categories: row.categories || [],
  };
}
