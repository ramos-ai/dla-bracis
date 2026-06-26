import React from 'react';
import { 
  FaHome, 
  FaChartBar, 
  FaFolder, 
  FaBook, 
  FaBell, 
  FaUsers, 
  FaEdit, 
  FaCheckCircle, 
  FaBullseye, 
  FaFileAlt, 
  FaUserFriends,
  FaTrophy,
  FaPlay,
  FaPlus,
  FaTrash,
  FaArrowLeft,
  FaArrowRight,
  FaArrowUp,
  FaArrowDown,
  FaMinus,
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaTimes,
  FaGraduationCap,
  FaClipboardCheck,
  FaDatabase,
  FaClock,
  FaChartLine,
  FaHandPaper,
  FaEraser,
  FaEye,
  FaEyeSlash,
  FaSquare,
  FaDrawPolygon,
  FaSync,
  FaFlag,
  FaDownload,
  FaExternalLinkAlt,
  FaExclamationTriangle,
  FaCog,
  FaCamera,
  FaEnvelope,
  FaUser,
  FaStar,
  FaTh,
  FaInfoCircle,
  FaExclamationCircle,
  FaLayerGroup
} from 'react-icons/fa';
import { 
  MdAssignment, 
  MdSchool,
  MdFileUpload,
  MdDescription
} from 'react-icons/md';

// Custom Kaggle icon component (official Kaggle "K" logo)
const KaggleIcon: React.FC<{ size?: number | string; className?: string; style?: React.CSSProperties }> = ({ 
  size = 20, 
  className = '', 
  style 
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={style}
    fill="currentColor"
  >
    <path d="M18.825 23.859c-.022.092-.117.141-.281.141h-3.139c-.187 0-.351-.082-.492-.248l-5.178-6.589-1.448 1.374v5.111c0 .235-.117.352-.351.352H5.505c-.236 0-.354-.117-.354-.352V.353c0-.233.118-.353.354-.353h2.431c.234 0 .351.12.351.353v14.343l6.203-6.272c.165-.165.33-.246.495-.246h3.239c.144 0 .236.06.281.18.046.149.034.255-.036.315l-6.555 6.344 6.836 8.507c.095.104.117.208.075.339z"/>
  </svg>
);

// Icon mapping for different contexts
export const Icons = {
  // Navigation
  home: FaHome,
  dashboard: FaChartBar,
  datasets: FaFolder,
  exercises: FaBook,
  notifications: FaBell,
  settings: FaUsers,
  resolution: FaEdit,
  book: FaBook,
  
  // Actions
  add: FaPlus,
  edit: FaEdit,
  delete: FaTrash,
  check: FaCheckCircle,
  cancel: FaTimes,
  close: FaTimes,
  save: FaCheckCircle,
  // Editor tools (segmentação / detecção)
  hand: FaHandPaper,
  polygon: FaDrawPolygon,
  rectangle: FaSquare,
  eraser: FaEraser,
  eye: FaEye,
  eyeSlash: FaEyeSlash,
  
  // Arrows
  arrowLeft: FaArrowLeft,
  arrowRight: FaArrowRight,
  arrowUp: FaArrowUp,
  arrowDown: FaArrowDown,
  minus: FaMinus,
  chevronDown: FaChevronDown,
  'chevron-left': FaChevronLeft,
  'chevron-right': FaChevronRight,
  
  // Status
  success: FaCheckCircle,
  error: FaTimes,
  correct: FaCheckCircle,
  incorrect: FaTimes,
  
  // Education specific
  graduation: FaGraduationCap,
  assignment: MdAssignment,
  clipboard: FaClipboardCheck,
  school: MdSchool,
  group: FaUserFriends,
  trophy: FaTrophy,
  target: FaBullseye,
  file: FaFileAlt,
  database: FaDatabase,
  clock: FaClock,
  chart: FaChartLine,
  play: FaPlay,
  upload: MdFileUpload,
  description: MdDescription,
  refresh: FaSync,
  report: FaFlag,
  export: FaDownload,
  download: FaDownload,
  external: FaExternalLinkAlt,
  warning: FaExclamationTriangle,
  kaggle: KaggleIcon,
  cog: FaCog,
  camera: FaCamera,
  envelope: FaEnvelope,
  user: FaUser,
  star: FaStar,
  grid: FaTh,
  layers: FaLayerGroup,
  info: FaInfoCircle,
  alert: FaExclamationCircle,
};

// Helper component for rendering icons
interface IconProps {
  name: keyof typeof Icons;
  size?: number | string;
  className?: string;
  color?: string;
  style?: React.CSSProperties;
}

export const Icon: React.FC<IconProps> = ({ name, size = 20, className = '', color, style }) => {
  const IconComponent = Icons[name];
  if (!IconComponent) {
    console.warn(`Icon "${name}" not found`);
    return null;
  }
  
  const iconStyle: React.CSSProperties = {
    ...(color ? { color } : {}),
    ...(style || {})
  };
  
  return (
    <IconComponent 
      size={size} 
      className={className}
      style={Object.keys(iconStyle).length > 0 ? iconStyle : undefined}
    />
  );
};

// Activity type icon mapping
export const getActivityIcon = (actionType: string): React.ReactNode => {
  const iconMap: Record<string, keyof typeof Icons> = {
    'exercise_completed': 'check',
    'exercise_created': 'play',
    'new_exercise_in_class': 'play',
    'submission_evaluated': 'chart',
    'dataset_created': 'database',
    'dataset_updated': 'edit',
    'media_labeled': 'clipboard',
    'default': 'file'
  };
  const iconName = iconMap[actionType] || iconMap['default'];
  return <Icon name={iconName} size={20} />;
};

/** Ícone por tipo de exercício (classificação, detecção, segmentação) para listas e cards */
export const getExerciseTypeIconName = (taskType: string | undefined): keyof typeof Icons => {
  const t = (taskType || 'classification').toLowerCase();
  if (t === 'segmentation') return 'polygon';
  if (t === 'detection') return 'rectangle';
  return 'clipboard';
};

export default Icon;
