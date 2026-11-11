// React Native Firebase is only used on iOS, to turn the APNs token into an FCM
// token. On Android expo-notifications already gets an FCM token, and a second
// FirebaseMessagingService would take incoming messages away from it.
module.exports = {
  dependencies: {
    '@react-native-firebase/app': { platforms: { android: null } },
    '@react-native-firebase/messaging': { platforms: { android: null } },
  },
};
