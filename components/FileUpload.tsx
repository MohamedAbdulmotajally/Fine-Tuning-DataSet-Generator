import React, from 'react';

interface FileUploadProps {
  id: string;
  title: string;
  description: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
  icon: React.ReactNode;
}

const FileUpload: React.FC<FileUploadProps> = ({ id, title, description, files, onFilesChange, icon }) => {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      onFilesChange(Array.from(event.target.files));
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 text-center h-full flex flex-col justify-between shadow-lg">
        <div>
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-gray-700">
                {icon}
            </div>
            <h3 className="mt-4 text-xl font-semibold text-text-primary">{title}</h3>
            <p className="mt-1 text-sm text-text-secondary">{description}</p>
        </div>
        <div className="mt-6">
            <label
                htmlFor={id}
                className="cursor-pointer bg-secondary hover:bg-gray-600 text-text-primary font-semibold py-2 px-4 rounded-md transition-colors duration-200"
            >
                {files.length > 0 ? `${files.length} file(s) selected` : "Select Files"}
            </label>
            <input
                id={id}
                type="file"
                multiple
                accept=".txt,.md,.pdf,.doc,.docx,.html"
                className="sr-only"
                onChange={handleFileChange}
            />
        </div>
      {files.length > 0 && (
        <ul className="mt-4 text-left text-sm text-text-secondary space-y-1 overflow-y-auto max-h-24">
          {files.map((file) => (
            <li key={file.name} className="truncate">
              {file.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default FileUpload;