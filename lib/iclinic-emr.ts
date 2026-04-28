/** JWT / provider `clinic_system` value for MDLand iClinic (case-insensitive). */
export const ICLINIC_CLINIC_SYSTEM_SLUG = 'iclinic'

/** FastDoc support contact for EMR integration and additional EMR system requests. */
export const FASTDOC_SUPPORT_EMAIL = 'support@fastdoc.cc'

export function providerClinicSystemIsIclinic(clinicSystem: string | null | undefined): boolean {
  return clinicSystem?.trim().toLowerCase() === ICLINIC_CLINIC_SYSTEM_SLUG
}
