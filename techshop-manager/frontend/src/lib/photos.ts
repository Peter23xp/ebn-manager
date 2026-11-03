/**
 * Photos du site public, auto-hébergées dans public/assets/photos
 * (licence Unsplash : https://unsplash.com/license). Aucune requête vers un
 * CDN tiers, donc aucune adresse IP de visiteur transmise (protection des données personnelles).
 */
export const photo = (id: string) => `/assets/photos/${id}.jpg`;
