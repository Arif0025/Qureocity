import { Linking } from 'react-native';

export type CustomerMessageChannel = 'whatsapp';

export type CustomerMessageDraft = {
  channel: CustomerMessageChannel;
  phone: string;
  message: string;
};

/** Opens an explicitly requested draft in the selected customer channel. */
export async function openCustomerMessageDraft({ channel, phone, message }: CustomerMessageDraft) {
  const rawDigits = phone.replace(/\D/g, '');
  const digits = rawDigits.length === 10 ? `91${rawDigits}` : rawDigits;
  if (digits.length < 11 || digits.length > 15) {
    throw new Error('Enter a valid international phone number.');
  }

  if (channel === 'whatsapp') {
    await Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`);
  }
}
