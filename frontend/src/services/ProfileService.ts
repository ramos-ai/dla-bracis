import { api } from "./api";

const authPath = "/auth";

export interface ProfileUpdateData {
  contact_info?: string;
  profile_image_id?: string | null;
}

export interface ProfileImageResponse {
  message: string;
  profile_image_id: string;
  user: {
    _id: string;
    name: string;
    email: string;
    role: string;
    contact_info?: string;
    profile_image_id?: string;
  };
}

/**
 * Update user profile (contact info)
 */
export async function updateProfile(data: ProfileUpdateData): Promise<ProfileImageResponse> {
  const res = await api.put(`${authPath}/update`, data);
  return res.data;
}

/**
 * Upload profile image
 */
export async function uploadProfileImage(file: File): Promise<ProfileImageResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await api.post(`${authPath}/profile-image`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return res.data;
}

/**
 * Delete profile image
 */
export async function deleteProfileImage(): Promise<{ message: string; user: ProfileImageResponse["user"] }> {
  const res = await api.delete(`${authPath}/profile-image`);
  return res.data;
}

/**
 * Get profile image URL from file ID
 */
export function getProfileImageUrl(fileId: string | null | undefined): string | null {
  if (!fileId) return null;
  return `/api/gridfs/image/${fileId}`;
}
