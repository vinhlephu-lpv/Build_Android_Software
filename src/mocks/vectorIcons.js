import React from 'react';
import { Text } from 'react-native-web';

const createIconSet = (fontFamily = 'MaterialIcons') => {
  return function Icon({ name = 'star', size = 20, color = '#ffffff', style, ...props }) {
    return (
      <Text
        style={[
          {
            fontSize: size,
            color: color,
            lineHeight: size,
            textAlign: 'center',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
        {...props}
      >
        ✦
      </Text>
    );
  };
};

export const MaterialIcons = createIconSet('MaterialIcons');
export const FontAwesome = createIconSet('FontAwesome');
export const FontAwesome5 = createIconSet('FontAwesome5');
export const Ionicons = createIconSet('Ionicons');
export const Feather = createIconSet('Feather');
export const MaterialCommunityIcons = createIconSet('MaterialCommunityIcons');
export const AntDesign = createIconSet('AntDesign');
export const Entypo = createIconSet('Entypo');
export const SimpleLineIcons = createIconSet('SimpleLineIcons');
export const Octicons = createIconSet('Octicons');
export const Zocial = createIconSet('Zocial');
export const Foundation = createIconSet('Foundation');
export const EvilIcons = createIconSet('EvilIcons');

export const createIconSetFromIcoMoon = () => createIconSet();
export const createIconSetFromFontello = () => createIconSet();

const defaultExport = createIconSet();
defaultExport.Button = ({ children, ...props }) => <button {...props}>{children}</button>;

export default defaultExport;
