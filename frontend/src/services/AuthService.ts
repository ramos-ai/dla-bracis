import { UserRoles } from '../contexts/Authentication';
import { api } from './api';

const authPath = '/auth';

export interface UserProps {
  _id: string,
  name: string,
  email: string,
  classId?: string,
  classIds?: string[],
  role: UserRoles,
  contact_info?: string,
  profile_image_id?: string,
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: UserProps;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  role?: 'student' | 'teacher' | 'admin' | 'unassigned';
}

export interface LoginData {
  email: string;
  password: string;
}

export const register = async (data: RegisterData): Promise<LoginResponse> => {
  const res = await api.post(authPath + '/register', data);
  // Don't save token on register - user must login manually after registration
  return res.data;
};

export const login = async (data: LoginData): Promise<LoginResponse> => {
  const res = await api.post(authPath + '/login', data);
  if (res.data.access_token) {
    localStorage.setItem('access_token', res.data.access_token);
  }
  return res.data;
};

export const getCurrentUser = async (): Promise<UserProps> => {
  const res = await api.get(authPath + '/me');
  return res.data.user;
};

export const getUser = async (id: string): Promise<UserProps> => {
  const res = await api.get(authPath + `/get_user/${id}`);
  return res.data;
};

export const updateUser = async (data: Partial<UserProps>): Promise<UserProps> => {
  const res = await api.put(authPath + '/update', data);
  return res.data.user;
};

export const listUsers = async (): Promise<UserProps[]> => {
  const res = await api.get(authPath + '/users');
  return res.data.users;
};

export const createUser = async (data: UserProps): Promise<string> => {
  const registerData: RegisterData = {
    name: data.name,
    email: data.email,
    password: '',
    ...(data.role && data.role !== 'unassigned' ? { role: data.role as 'student' | 'teacher' | 'admin' } : {})
  };
  await register(registerData);
  return 'User created';
};

export const editUser = async (data: UserProps): Promise<string> => {
  await updateUser(data);
  return 'User updated';
};

export const deleteUser = async (id: string): Promise<string> => {
  return await api.delete(authPath + `/delete_user?id=${id}`).then(() => 'User deleted');
};
