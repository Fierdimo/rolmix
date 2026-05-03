import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

const BUCKET = 'map-backgrounds';

export async function pickAndUploadMapBackground(mapId: string): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Se requiere acceso a la galería de imágenes');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const uri   = asset.uri;
  const ext   = (uri.split('.').pop() ?? 'jpg').toLowerCase().replace('jpeg', 'jpg');
  const path  = `${mapId}/background.${ext}`;
  const mime  = ext === 'png' ? 'image/png' : 'image/jpeg';

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });

  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: true });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path);

  return urlData.publicUrl;
}
