export type DocTypeConfig = { code: string; label: string; required: boolean };

export type UploadedDoc = {
  id: string;
  type: string;
  fileUrl: string;
  fileName?: string;
};

export type PostulacionForm = {
  firstName: string;
  lastName: string;
  rut: string;
  email: string;
  phoneMobile: string;
  addressFormatted: string;
  googlePlaceId: string;
  commune: string;
  city: string;
  region: string;
  lat: string;
  lng: string;
  birthDate: string;
  sex: string;
  nacionalidad: string;
  afp: string;
  isapreName: string;
  isapreExtraPercent: string;
  hasMobilization: string;
  availableExtraShifts: string;
  shoeSize: string;
  pantsSize: string;
  tshirtSize: string;
  shirtSize: string;
  geologoSize: string;
  polarSize: string;
  jacketSize: string;
  heightCm: string;
  weightKg: string;
  bankCode: string;
  accountType: string;
  accountNumber: string;
  notes: string;
};

export const EMPTY_FORM: PostulacionForm = {
  firstName: "",
  lastName: "",
  rut: "",
  email: "",
  phoneMobile: "",
  addressFormatted: "",
  googlePlaceId: "",
  commune: "",
  city: "",
  region: "",
  lat: "",
  lng: "",
  birthDate: "",
  sex: "",
  nacionalidad: "Chile",
  afp: "",
  isapreName: "",
  isapreExtraPercent: "",
  hasMobilization: "si",
  availableExtraShifts: "si",
  shoeSize: "",
  pantsSize: "",
  tshirtSize: "",
  shirtSize: "",
  geologoSize: "",
  polarSize: "",
  jacketSize: "",
  heightCm: "",
  weightKg: "",
  bankCode: "",
  accountType: "",
  accountNumber: "",
  notes: "",
};
